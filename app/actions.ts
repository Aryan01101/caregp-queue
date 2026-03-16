'use server'

import { supabase } from '@/lib/supabase'
import { Database, MeetingRequest } from '@/lib/types'
import { revalidatePath } from 'next/cache'

// Statuses that allow further actions (not final)
const ACTIONABLE_STATUSES: MeetingRequest['status'][] = ['pending', 'rescheduled']

// Helper to check if a status allows actions
function isActionable(status: MeetingRequest['status']): boolean {
  return ACTIONABLE_STATUSES.includes(status)
}

const FAKE_REQUESTS = [
  {
    patient_name: 'James Morrison',
    doctor_name: 'Dr. Patel',
    requested_time: '2026-03-19T09:00:00',
    reason_for_visit: 'Blood pressure checkup',
    confidence_score: 0.62,
    flag_reason: 'Patient was unclear about preferred doctor name',
    status: 'pending' as const
  },
  {
    patient_name: 'Sarah Chen',
    doctor_name: 'Dr. Smith',
    requested_time: '2026-03-20T14:00:00',
    reason_for_visit: 'Annual checkup',
    confidence_score: 0.78,
    flag_reason: 'Time slot preference was ambiguous',
    status: 'pending' as const
  },
  {
    patient_name: 'David Nguyen',
    doctor_name: 'Dr. Johnson',
    requested_time: '2026-03-21T11:00:00',
    reason_for_visit: 'Flu symptoms',
    confidence_score: 0.91,
    flag_reason: null,
    status: 'auto_confirmed' as const
  },
  {
    patient_name: 'Emily Tran',
    doctor_name: 'Dr. Patel',
    requested_time: '2026-03-22T10:00:00',
    reason_for_visit: 'Diabetes management',
    confidence_score: 0.95,
    flag_reason: null,
    status: 'auto_confirmed' as const
  },
  {
    patient_name: 'Michael Wong',
    doctor_name: 'Dr. Smith',
    requested_time: '2026-03-23T15:00:00',
    reason_for_visit: 'Skin condition review',
    confidence_score: 0.88,
    flag_reason: null,
    status: 'auto_confirmed' as const
  }
]

export async function simulateAgentRequest() {
  // Randomly select one of the five fake requests
  const randomRequest = FAKE_REQUESTS[Math.floor(Math.random() * FAKE_REQUESTS.length)]

  // Insert the fake meeting request
  const { error } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue, works correctly at runtime
    .insert(randomRequest)

  if (error) {
    console.error('Error simulating agent request:', error)
    throw new Error('Failed to simulate agent request')
  }

  // Revalidate the queue page to show the new request
  revalidatePath('/queue')

  return {
    success: true,
    patient: randomRequest.patient_name,
    doctor: randomRequest.doctor_name,
  }
}

export async function approveMeeting(requestId: string) {
  // First, fetch the current request to check if it's actionable
  const { data: request, error: fetchError } = await supabase
    .from('meeting_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    throw new Error('Request not found')
  }

  const meetingRequest = request as MeetingRequest

  if (!isActionable(meetingRequest.status)) {
    throw new Error('Request has already been finalized')
  }

  // Update request status with conditional WHERE clause for concurrency safety
  // This ensures only one person can approve it even if clicked simultaneously
  const { data: updated, error: updateError } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', meetingRequest.status) // CRITICAL: Only update if status hasn't changed
    .select()
    .single()

  if (updateError) {
    console.error('Approve: Update error', updateError)
    throw new Error(`Database error: ${updateError.message}`)
  }

  if (!updated) {
    // Re-fetch to see if already approved
    const { data: currentRequest } = await supabase
      .from('meeting_requests')
      .select('status')
      .eq('id', requestId)
      .single()

    const current = currentRequest as { status: MeetingRequest['status'] } | null

    if (current && current.status === 'approved') {
      // Already approved - return success
      return { success: true, alreadyProcessed: true }
    }

    throw new Error('Request has already been processed by another user')
  }

  // Write to audit log
  const { error: auditError } = await supabase
    .from('meeting_actions')
    // @ts-ignore - Supabase type inference issue
    .insert({
      request_id: requestId,
      patient_name: meetingRequest.patient_name,
      doctor_name: meetingRequest.doctor_name,
      requested_time: meetingRequest.requested_time,
      reason_for_visit: meetingRequest.reason_for_visit,
      action: 'approved',
      acted_by: 'Staff',
    })

  if (auditError) {
    console.error('Failed to write audit log:', auditError)
    // Don't throw - the approval still succeeded
  }

  revalidatePath('/queue')
  revalidatePath('/audit')

  return { success: true }
}

export async function rejectMeeting(requestId: string) {
  // First, fetch the current request to check if it's actionable
  const { data: request, error: fetchError } = await supabase
    .from('meeting_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    throw new Error('Request not found')
  }

  const meetingRequest = request as MeetingRequest

  if (!isActionable(meetingRequest.status)) {
    throw new Error('Request has already been finalized')
  }

  // Update request status with conditional WHERE clause for concurrency safety
  const { data: updated, error: updateError } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', meetingRequest.status) // CRITICAL: Only update if status hasn't changed
    .select()
    .single()

  if (updateError) {
    console.error('Reject: Update error', updateError)
    throw new Error(`Database error: ${updateError.message}`)
  }

  if (!updated) {
    // Re-fetch to see if already rejected
    const { data: currentRequest } = await supabase
      .from('meeting_requests')
      .select('status')
      .eq('id', requestId)
      .single()

    const current = currentRequest as { status: MeetingRequest['status'] } | null

    if (current && current.status === 'rejected') {
      // Already rejected - return success
      return { success: true, alreadyProcessed: true }
    }

    throw new Error('Request has already been processed by another user')
  }

  // Write to audit log
  const { error: auditError } = await supabase
    .from('meeting_actions')
    // @ts-ignore - Supabase type inference issue
    .insert({
      request_id: requestId,
      patient_name: meetingRequest.patient_name,
      doctor_name: meetingRequest.doctor_name,
      requested_time: meetingRequest.requested_time,
      reason_for_visit: meetingRequest.reason_for_visit,
      action: 'rejected',
      acted_by: 'Staff',
    })

  if (auditError) {
    console.error('Failed to write audit log:', auditError)
    // Don't throw - the rejection still succeeded
  }

  revalidatePath('/queue')
  revalidatePath('/audit')

  return { success: true }
}

export async function needsCallbackMeeting(requestId: string) {
  // First, fetch the current request to check if it's actionable
  const { data: request, error: fetchError } = await supabase
    .from('meeting_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    throw new Error('Request not found')
  }

  const meetingRequest = request as MeetingRequest

  if (!isActionable(meetingRequest.status)) {
    throw new Error('Request has already been finalized')
  }

  // Update request status with conditional WHERE clause for concurrency safety
  const { data: updated, error: updateError } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue
    .update({ status: 'needs_callback', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', meetingRequest.status) // CRITICAL: Only update if status hasn't changed
    .select()
    .single()

  if (updateError) {
    console.error('Needs Callback: Update error', updateError)
    throw new Error(`Database error: ${updateError.message}`)
  }

  if (!updated) {
    // Re-fetch to see if already marked for callback
    const { data: currentRequest } = await supabase
      .from('meeting_requests')
      .select('status')
      .eq('id', requestId)
      .single()

    const current = currentRequest as { status: MeetingRequest['status'] } | null

    if (current && current.status === 'needs_callback') {
      // Already marked for callback - return success
      return { success: true, alreadyProcessed: true }
    }

    throw new Error('Request has already been processed by another user')
  }

  // Write to audit log
  const { error: auditError } = await supabase
    .from('meeting_actions')
    // @ts-ignore - Supabase type inference issue
    .insert({
      request_id: requestId,
      patient_name: meetingRequest.patient_name,
      doctor_name: meetingRequest.doctor_name,
      requested_time: meetingRequest.requested_time,
      reason_for_visit: meetingRequest.reason_for_visit,
      action: 'needs_callback',
      acted_by: 'Staff',
    })

  if (auditError) {
    console.error('Failed to write audit log:', auditError)
    // Don't throw - the needs_callback still succeeded
  }

  revalidatePath('/queue')
  revalidatePath('/audit')

  return { success: true }
}

export async function rescheduleMeeting(requestId: string, newTime: string) {
  // First, fetch the current request to check if it's actionable
  const { data: request, error: fetchError } = await supabase
    .from('meeting_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    console.error('Reschedule: Request not found', requestId, fetchError)
    throw new Error('Request not found')
  }

  const meetingRequest = request as MeetingRequest
  console.log('Reschedule: Current status', meetingRequest.status)

  if (!isActionable(meetingRequest.status)) {
    console.log('Reschedule: Not actionable, status is', meetingRequest.status)
    throw new Error('Request has already been finalized')
  }

  // Update request with new time and status rescheduled
  const { data: updated, error: updateError } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue
    .update({
      requested_time: newTime,
      status: 'rescheduled',
      updated_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .eq('status', meetingRequest.status) // CRITICAL: Only update if status hasn't changed
    .select()
    .single()

  if (updateError) {
    console.error('Reschedule: Update error', updateError)
    throw new Error(`Database error: ${updateError.message}`)
  }

  if (!updated) {
    console.log('Reschedule: No rows updated. Status was:', meetingRequest.status)
    // This happens when status changed between our read and write (race condition)
    // Re-fetch to see current status
    const { data: currentRequest } = await supabase
      .from('meeting_requests')
      .select('status')
      .eq('id', requestId)
      .single()

    const current = currentRequest as { status: MeetingRequest['status'] } | null

    if (current && current.status === 'rescheduled') {
      // Already rescheduled by another concurrent request - this is OK, silently succeed
      console.log('Reschedule: Already rescheduled, returning success')
      return { success: true, alreadyProcessed: true }
    }

    throw new Error('Request has already been processed by another user')
  }

  // Write to audit log
  const { error: auditError } = await supabase
    .from('meeting_actions')
    // @ts-ignore - Supabase type inference issue
    .insert({
      request_id: requestId,
      patient_name: meetingRequest.patient_name,
      doctor_name: meetingRequest.doctor_name,
      requested_time: meetingRequest.requested_time,
      reason_for_visit: meetingRequest.reason_for_visit,
      action: 'rescheduled',
      acted_by: 'Staff',
      new_time: newTime,
    })

  if (auditError) {
    console.error('Failed to write audit log:', auditError)
    // Don't throw - the reschedule still succeeded
  }

  revalidatePath('/queue')
  revalidatePath('/audit')

  return { success: true }
}

export async function reassignDoctor(requestId: string, newDoctor: string) {
  // First, fetch the current request to check if it's actionable
  const { data: request, error: fetchError } = await supabase
    .from('meeting_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    throw new Error('Request not found')
  }

  const meetingRequest = request as MeetingRequest

  if (!isActionable(meetingRequest.status)) {
    throw new Error('Request has already been finalized')
  }

  // Update request with new doctor and set status to rescheduled (removes from pending queue)
  const { data: updated, error: updateError } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue
    .update({
      doctor_name: newDoctor,
      status: 'rescheduled',
      updated_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .eq('status', meetingRequest.status) // CRITICAL: Only update if status hasn't changed
    .select()
    .single()

  if (updateError) {
    console.error('Reassign: Update error', updateError)
    throw new Error(`Database error: ${updateError.message}`)
  }

  if (!updated) {
    // Re-fetch to see if already rescheduled
    const { data: currentRequest } = await supabase
      .from('meeting_requests')
      .select('status')
      .eq('id', requestId)
      .single()

    const current = currentRequest as { status: MeetingRequest['status'] } | null

    if (current && current.status === 'rescheduled') {
      // Already rescheduled - return success
      return { success: true, alreadyProcessed: true }
    }

    throw new Error('Request has already been processed by another user')
  }

  // Write to audit log
  const { error: auditError } = await supabase
    .from('meeting_actions')
    // @ts-ignore - Supabase type inference issue
    .insert({
      request_id: requestId,
      patient_name: meetingRequest.patient_name,
      doctor_name: meetingRequest.doctor_name,
      requested_time: meetingRequest.requested_time,
      reason_for_visit: meetingRequest.reason_for_visit,
      action: 'reassigned',
      acted_by: 'Staff',
      new_doctor: newDoctor,
    })

  if (auditError) {
    console.error('Failed to write audit log:', auditError)
    // Don't throw - the reassignment still succeeded
  }

  revalidatePath('/queue')
  revalidatePath('/audit')

  return { success: true }
}

'use server'

import { supabase } from '@/lib/supabase'
import { Database, MeetingRequest } from '@/lib/types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// Validation schemas
const uuidSchema = z.string().uuid('Invalid request ID format')
const isoDateSchema = z.string().datetime('Invalid date format')
const doctorNameSchema = z.string().min(1, 'Doctor name is required').max(100, 'Doctor name is too long')

// Statuses that allow further actions (not final)
const ACTIONABLE_STATUSES: MeetingRequest['status'][] = ['pending', 'rescheduled']

// Helper to check if a status allows actions
function isActionable(status: MeetingRequest['status']): boolean {
  return ACTIONABLE_STATUSES.includes(status)
}

// Helper function to generate random future date within the next 7 days
function getRandomFutureDate(): string {
  const now = new Date()
  const daysAhead = Math.floor(Math.random() * 7) + 1 // 1-7 days ahead
  const hoursOfDay = [9, 10, 11, 14, 15, 16] // Business hours
  const randomHour = hoursOfDay[Math.floor(Math.random() * hoursOfDay.length)]

  const futureDate = new Date(now)
  futureDate.setDate(now.getDate() + daysAhead)
  futureDate.setHours(randomHour, 0, 0, 0)

  return futureDate.toISOString()
}

function generateFakeRequest() {
  const templates = [
    {
      patient_name: 'James Morrison',
      doctor_name: 'Dr. Patel',
      reason_for_visit: 'Blood pressure checkup',
      confidence_score: 0.62,
      flag_reason: 'Patient was unclear about preferred doctor name',
      status: 'pending' as const
    },
    {
      patient_name: 'Sarah Chen',
      doctor_name: 'Dr. Smith',
      reason_for_visit: 'Annual checkup',
      confidence_score: 0.78,
      flag_reason: 'Time slot preference was ambiguous',
      status: 'pending' as const
    },
    {
      patient_name: 'David Nguyen',
      doctor_name: 'Dr. Johnson',
      reason_for_visit: 'Flu symptoms',
      confidence_score: 0.91,
      flag_reason: null,
      status: 'auto_confirmed' as const
    },
    {
      patient_name: 'Emily Tran',
      doctor_name: 'Dr. Patel',
      reason_for_visit: 'Diabetes management',
      confidence_score: 0.95,
      flag_reason: null,
      status: 'auto_confirmed' as const
    },
    {
      patient_name: 'Michael Wong',
      doctor_name: 'Dr. Smith',
      reason_for_visit: 'Skin condition review',
      confidence_score: 0.88,
      flag_reason: null,
      status: 'auto_confirmed' as const
    }
  ]

  const template = templates[Math.floor(Math.random() * templates.length)]
  return {
    ...template,
    requested_time: getRandomFutureDate()
  }
}

export async function simulateAgentRequest() {
  const randomRequest = generateFakeRequest()

  // Insert the fake meeting request
  const { error } = await supabase
    .from('meeting_requests')
    .insert(randomRequest as any)

  if (error) {
    throw new Error('Failed to simulate agent request')
  }

  revalidatePath('/queue')
}

export async function approveMeeting(requestId: string) {
  // Validate input
  uuidSchema.parse(requestId)

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
    .update({ status: 'approved' })
    .eq('id', requestId)
    .eq('status', meetingRequest.status) // CRITICAL: Only update if status hasn't changed
    .select()
    .single()

  if (updateError) {
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
  await supabase
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

  revalidatePath('/queue')
  revalidatePath('/audit')

  return { success: true }
}

export async function rejectMeeting(requestId: string) {
  // Validate input
  uuidSchema.parse(requestId)

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
  //
  const { data: updated, error: updateError } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue
    .update({ status: 'rejected' })
    .eq('id', requestId)
    .eq('status', meetingRequest.status) // CRITICAL: Only update if status hasn't changed
    .select()
    .single()

  if (updateError) {
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
  await supabase
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

  revalidatePath('/queue')
  revalidatePath('/audit')

  return { success: true }
}

export async function needsCallbackMeeting(requestId: string) {
  // Validate input
  uuidSchema.parse(requestId)

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
  //
  const { data: updated, error: updateError } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue
    .update({ status: 'needs_callback' })
    .eq('id', requestId)
    .eq('status', meetingRequest.status) // CRITICAL: Only update if status hasn't changed
    .select()
    .single()

  if (updateError) {
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
  await supabase
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

  revalidatePath('/queue')
  revalidatePath('/audit')

  return { success: true }
}

export async function rescheduleMeeting(requestId: string, newTime: string) {
  // Validate input
  uuidSchema.parse(requestId)
  isoDateSchema.parse(newTime)

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

  // Update request with new time and status rescheduled
  //
  const { data: updated, error: updateError } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue
    .update({
      requested_time: newTime,
      status: 'rescheduled',
    })
    .eq('id', requestId)
    .eq('status', meetingRequest.status) // CRITICAL: Only update if status hasn't changed
    .select()
    .single()

  if (updateError) {
    throw new Error(`Database error: ${updateError.message}`)
  }

  if (!updated) {
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
      return { success: true, alreadyProcessed: true }
    }

    throw new Error('Request has already been processed by another user')
  }

  // Write to audit log
  await supabase
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

  revalidatePath('/queue')
  revalidatePath('/audit')

  return { success: true }
}

export async function reassignDoctor(requestId: string, newDoctor: string) {
  // Validate input
  uuidSchema.parse(requestId)
  doctorNameSchema.parse(newDoctor)

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
  //
  const { data: updated, error: updateError } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue
    .update({
      doctor_name: newDoctor,
      status: 'rescheduled',
    })
    .eq('id', requestId)
    .eq('status', meetingRequest.status) // CRITICAL: Only update if status hasn't changed
    .select()
    .single()

  if (updateError) {
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
  await supabase
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

  revalidatePath('/queue')
  revalidatePath('/audit')

  return { success: true }
}

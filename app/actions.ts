'use server'

import { supabase } from '@/lib/supabase'
import { Database, MeetingRequest } from '@/lib/types'
import { revalidatePath } from 'next/cache'

// Preset data for simulating agent requests
const PATIENT_NAMES = [
  'Emma Wilson',
  'Liam Chen',
  'Olivia Martinez',
  'Noah Thompson',
  'Ava Rodriguez',
  'William Davis',
  'Sophia Anderson',
  'James Taylor',
]

const DOCTORS = [
  'Dr. Smith',
  'Dr. Johnson',
  'Dr. Patel',
  'Dr. Lee',
  'Dr. Garcia',
  'Dr. Chen',
]

const REASONS_FOR_VISIT = [
  'Initial consultation',
  'Follow-up appointment',
  'Annual checkup',
  'Urgent care',
  'Routine examination',
  'Lab results review',
  'Prescription refill',
  'Health screening',
]

// Helper function to generate random future date/time
function generateRandomFutureDateTime(): string {
  const now = new Date()
  const daysAhead = Math.floor(Math.random() * 14) + 1 // 1-14 days ahead
  const futureDate = new Date(now)
  futureDate.setDate(futureDate.getDate() + daysAhead)

  // Set random hour between 9 AM and 5 PM
  const hour = Math.floor(Math.random() * 8) + 9 // 9-16 (9 AM to 5 PM)
  futureDate.setHours(hour, 0, 0, 0) // Set to exact hour

  return futureDate.toISOString()
}

export async function simulateAgentRequest() {
  // Random patient name
  const patientName = PATIENT_NAMES[Math.floor(Math.random() * PATIENT_NAMES.length)]

  // Random doctor
  const doctorName = DOCTORS[Math.floor(Math.random() * DOCTORS.length)]

  // Random reason for visit
  const reason = REASONS_FOR_VISIT[Math.floor(Math.random() * REASONS_FOR_VISIT.length)]

  // Random future date/time
  const requestedTime = generateRandomFutureDateTime()

  // Insert the fake meeting request
  const { error } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue, works correctly at runtime
    .insert({
      patient_name: patientName,
      doctor_name: doctorName,
      requested_time: requestedTime,
      reason_for_visit: reason,
      status: 'pending',
    })

  if (error) {
    console.error('Error simulating agent request:', error)
    throw new Error('Failed to simulate agent request')
  }

  // Revalidate the queue page to show the new request
  revalidatePath('/queue')

  return { success: true, patient: patientName, doctor: doctorName }
}

export async function approveMeeting(requestId: string) {
  // First, fetch the current request to check if it's still pending
  const { data: request, error: fetchError } = await supabase
    .from('meeting_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    throw new Error('Request not found')
  }

  const meetingRequest = request as MeetingRequest

  if (meetingRequest.status !== 'pending') {
    throw new Error('Request has already been processed')
  }

  // Update request status with conditional WHERE clause for concurrency safety
  // This ensures only one person can approve it even if clicked simultaneously
  const { data: updated, error: updateError } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'pending') // CRITICAL: Only update if still pending
    .select()
    .single()

  if (updateError || !updated) {
    // If update failed, request was already processed by someone else
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
  // First, fetch the current request to check if it's still pending
  const { data: request, error: fetchError } = await supabase
    .from('meeting_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    throw new Error('Request not found')
  }

  const meetingRequest = request as MeetingRequest

  if (meetingRequest.status !== 'pending') {
    throw new Error('Request has already been processed')
  }

  // Update request status with conditional WHERE clause for concurrency safety
  const { data: updated, error: updateError } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'pending') // CRITICAL: Only update if still pending
    .select()
    .single()

  if (updateError || !updated) {
    // If update failed, request was already processed by someone else
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

export async function rescheduleMeeting(requestId: string, newTime: string) {
  // First, fetch the current request to check if it's still pending
  const { data: request, error: fetchError } = await supabase
    .from('meeting_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    throw new Error('Request not found')
  }

  const meetingRequest = request as MeetingRequest

  if (meetingRequest.status !== 'pending') {
    throw new Error('Request has already been processed')
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
    .eq('status', 'pending') // CRITICAL: Only update if still pending
    .select()
    .single()

  if (updateError || !updated) {
    // If update failed, request was already processed by someone else
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
  // First, fetch the current request to check if it's still pending
  const { data: request, error: fetchError } = await supabase
    .from('meeting_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    throw new Error('Request not found')
  }

  const meetingRequest = request as MeetingRequest

  if (meetingRequest.status !== 'pending') {
    throw new Error('Request has already been processed')
  }

  // Update request with new doctor (keep status as pending for further action)
  const { data: updated, error: updateError } = await supabase
    .from('meeting_requests')
    // @ts-ignore - Supabase type inference issue
    .update({
      doctor_name: newDoctor,
      updated_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .eq('status', 'pending') // CRITICAL: Only update if still pending
    .select()
    .single()

  if (updateError || !updated) {
    // If update failed, request was already processed by someone else
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

// Export the doctor list for use in UI components
export { DOCTORS }

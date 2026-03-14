'use server'

import { supabase } from '@/lib/supabase'
import { Database, RefillRequest } from '@/lib/types'
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

const MEDICATIONS = [
  { name: 'Ventolin', dosage: '100mcg' },
  { name: 'Metformin', dosage: '500mg' },
  { name: 'Lipitor', dosage: '20mg' },
  { name: 'Lisinopril', dosage: '10mg' },
  { name: 'Levothyroxine', dosage: '50mcg' },
  { name: 'Amlodipine', dosage: '5mg' },
  { name: 'Metoprolol', dosage: '25mg' },
  { name: 'Omeprazole', dosage: '20mg' },
]

export async function simulateAgentRequest() {
  // Random patient name
  const patientName = PATIENT_NAMES[Math.floor(Math.random() * PATIENT_NAMES.length)]

  // Random medication
  const medication = MEDICATIONS[Math.floor(Math.random() * MEDICATIONS.length)]

  // Insert the fake refill request
  const { error } = await supabase
    .from('refill_requests')
    // @ts-ignore - Supabase type inference issue, works correctly at runtime
    .insert({
      patient_name: patientName,
      medication: medication.name,
      dosage: medication.dosage,
      status: 'pending',
    })

  if (error) {
    console.error('Error simulating agent request:', error)
    throw new Error('Failed to simulate agent request')
  }

  // Revalidate the queue page to show the new request
  revalidatePath('/queue')

  return { success: true, patient: patientName, medication: medication.name }
}

export async function approveRequest(requestId: string) {
  // First, fetch the current request to check if it's still pending
  const { data: request, error: fetchError } = await supabase
    .from('refill_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    throw new Error('Request not found')
  }

  const refillRequest = request as RefillRequest

  if (refillRequest.status !== 'pending') {
    throw new Error('Request has already been processed')
  }

  // Update request status with conditional WHERE clause for concurrency safety
  // This ensures only one person can approve it even if clicked simultaneously
  const { data: updated, error: updateError } = await supabase
    .from('refill_requests')
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
    .from('approval_actions')
    // @ts-ignore - Supabase type inference issue
    .insert({
      request_id: requestId,
      patient_name: refillRequest.patient_name,
      medication: refillRequest.medication,
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

export async function rejectRequest(requestId: string) {
  // First, fetch the current request to check if it's still pending
  const { data: request, error: fetchError } = await supabase
    .from('refill_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    throw new Error('Request not found')
  }

  const refillRequest = request as RefillRequest

  if (refillRequest.status !== 'pending') {
    throw new Error('Request has already been processed')
  }

  // Update request status with conditional WHERE clause for concurrency safety
  const { data: updated, error: updateError } = await supabase
    .from('refill_requests')
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
    .from('approval_actions')
    // @ts-ignore - Supabase type inference issue
    .insert({
      request_id: requestId,
      patient_name: refillRequest.patient_name,
      medication: refillRequest.medication,
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

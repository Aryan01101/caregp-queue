import { supabase } from '@/lib/supabase'
import { Database } from '@/lib/types'
import { parseEmailToAppointment, ParsedAppointmentSchema } from '@/lib/email-parser'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Schema for incoming email webhook
const EmailWebhookSchema = z.object({
  from: z.string().email(),
  subject: z.string(),
  body: z.string(),
  receivedAt: z.string().datetime().optional(),
})

/**
 * POST /api/intake/email
 *
 * Receives email data from webhooks (SendGrid, Mailgun, etc.) or direct submission
 * Parses the email content to extract appointment request details
 * Creates a new appointment request in the database
 *
 * Example webhook payload:
 * {
 *   "from": "patient@example.com",
 *   "subject": "Appointment Request",
 *   "body": "Hi, I'm John Doe and I need to see Dr. Smith for a checkup next week."
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate incoming email data
    const emailData = EmailWebhookSchema.parse(body)

    // Parse email content to extract appointment details
    const appointmentData = await parseEmailToAppointment(
      emailData.body,
      emailData.subject
    )

    // Validate parsed data
    ParsedAppointmentSchema.parse(appointmentData)

    // Determine status based on confidence score
    const status = appointmentData.confidence_score >= 0.85 ? 'auto_confirmed' : 'pending'

    // Insert appointment request into database
    const { data, error } = await supabase
      .from('meeting_requests')
      // @ts-ignore - Supabase type inference issue
      .insert({
        ...appointmentData,
        status,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Database error: ${error.message}`)
    }

    const createdRequest = data as any

    return NextResponse.json(
      {
        success: true,
        message: 'Appointment request created successfully',
        appointmentId: createdRequest.id,
        status,
        confidence: appointmentData.confidence_score,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.issues,
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/intake/email
 *
 * Returns information about the email intake endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/intake/email',
    method: 'POST',
    description: 'Receives email data and creates appointment requests',
    expectedPayload: {
      from: 'string (email)',
      subject: 'string',
      body: 'string (email content)',
      receivedAt: 'string (optional ISO datetime)',
    },
    example: {
      from: 'patient@example.com',
      subject: 'Appointment Request',
      body: "Hi, I'm John Doe and I need to see Dr. Smith for a checkup next week.",
    },
  })
}

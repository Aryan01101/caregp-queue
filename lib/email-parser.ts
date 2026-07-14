import { z } from 'zod'

// Schema for parsed appointment request from email
export const ParsedAppointmentSchema = z.object({
  patient_name: z.string().min(1),
  doctor_name: z.string().min(1),
  requested_time: z.string().datetime(),
  reason_for_visit: z.string().min(1),
  confidence_score: z.number().min(0).max(1),
  flag_reason: z.string().nullable(),
})

export type ParsedAppointment = z.infer<typeof ParsedAppointmentSchema>

/**
 * Parse email content to extract appointment request information
 * This is a simplified version. In production, you would use:
 * - OpenAI GPT-4 or Anthropic Claude to parse natural language
 * - More sophisticated regex patterns
 * - Integration with email services (SendGrid, Mailgun, etc.)
 */
export async function parseEmailToAppointment(
  emailBody: string,
  subject: string
): Promise<ParsedAppointment> {
  // Simple pattern matching for demonstration
  // In production, use an LLM API for better accuracy

  let confidence = 0.5
  let flags: string[] = []

  // Extract patient name
  const patientMatch = emailBody.match(/(?:patient|my name is|I am|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i)
  const patient_name = patientMatch?.[1] || 'Unknown Patient'
  if (!patientMatch) {
    flags.push('Patient name unclear')
    confidence -= 0.15
  }

  // Extract doctor name
  const doctorMatch = emailBody.match(/(?:Dr\.|Doctor)\s+([A-Z][a-z]+)/i)
  const doctor_name = doctorMatch?.[0] || 'Dr. Smith'
  if (!doctorMatch) {
    flags.push('Doctor preference not specified')
    confidence -= 0.15
  }

  // Extract requested time - look for dates and times
  const datePatterns = [
    /(\d{1,2}\/\d{1,2}\/\d{4})/,  // MM/DD/YYYY
    /(tomorrow|next week|monday|tuesday|wednesday|thursday|friday)/i,
    /(\d{1,2}:\d{2}\s*(?:AM|PM))/i,  // Time like 2:30 PM
  ]

  let timeFound = false
  let requested_time = new Date()

  for (const pattern of datePatterns) {
    if (pattern.test(emailBody)) {
      timeFound = true
      break
    }
  }

  if (!timeFound) {
    // Default to next business day at 10 AM
    requested_time.setDate(requested_time.getDate() + 1)
    requested_time.setHours(10, 0, 0, 0)
    flags.push('Appointment time not clearly specified')
    confidence -= 0.2
  } else {
    // For demo, set to a week from now at 2 PM
    requested_time.setDate(requested_time.getDate() + 7)
    requested_time.setHours(14, 0, 0, 0)
  }

  // Extract reason for visit
  const reasonPatterns = [
    /(?:for|regarding|about)\s+(?:a\s+)?([a-z\s]{5,50}(?:checkup|appointment|visit|consultation|pain|issue|problem|review))/i,
    /(?:I (?:have|need))\s+(?:a\s+)?([a-z\s]{5,50})/i,
  ]

  let reason_for_visit = 'General consultation'
  for (const pattern of reasonPatterns) {
    const match = emailBody.match(pattern)
    if (match) {
      reason_for_visit = match[1].trim()
      confidence += 0.1
      break
    }
  }

  // Calculate final confidence score
  const finalConfidence = Math.max(0.4, Math.min(0.95, confidence + 0.5))

  return {
    patient_name,
    doctor_name,
    requested_time: requested_time.toISOString(),
    reason_for_visit,
    confidence_score: finalConfidence,
    flag_reason: flags.length > 0 ? flags.join('; ') : null,
  }
}

/**
 * In production, this would integrate with LLM APIs like:
 *
 * import Anthropic from '@anthropic-ai/sdk'
 *
 * export async function parseEmailWithClaude(emailBody: string) {
 *   const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
 *
 *   const message = await anthropic.messages.create({
 *     model: "claude-3-5-sonnet-20241022",
 *     max_tokens: 1024,
 *     messages: [{
 *       role: "user",
 *       content: `Extract appointment details from this email as JSON:
 *         {
 *           "patient_name": "string",
 *           "doctor_name": "string",
 *           "requested_time": "ISO datetime",
 *           "reason_for_visit": "string",
 *           "confidence_score": 0-1,
 *           "flag_reason": "string or null"
 *         }
 *
 *         Email: ${emailBody}`
 *     }]
 *   })
 *
 *   return JSON.parse(message.content[0].text)
 * }
 */

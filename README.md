# Hermes - AI-Powered Appointment Management System

An intelligent healthcare appointment management system with email intake, automated processing, and real-time queue management.

## Features

### Email Intake System
- **AI-Powered Email Parsing**: Automatically extracts appointment details from unstructured patient emails
- **Webhook Integration**: Compatible with SendGrid, Mailgun, Postmark, AWS SES, and other email services
- **Confidence Scoring**: Automatically approves high-confidence requests (≥85%) and flags uncertain ones for manual review
- **Intelligent Flagging**: Identifies missing or ambiguous information for staff follow-up

### Queue Management
- **Real-time Updates**: Live synchronization across all users using Supabase Realtime
- **Dual Queue System**: Separate views for pending reviews and auto-confirmed appointments
- **Concurrency Safety**: Race-condition protection ensures only one person can process each request
- **Multiple Actions**: Approve, reject, reschedule, reassign doctor, or mark for callback

### Audit Trail
- **Complete Logging**: Track every action with timestamps and user attribution
- **Detailed History**: View patient name, doctor, time, reason, action type, and details
- **Real-time Updates**: Audit log updates instantly as actions are performed

### Security & Reliability
- **Input Validation**: Zod schemas validate all user inputs and API requests
- **Type Safety**: Full TypeScript coverage with proper Supabase type integration
- **Error Boundaries**: Graceful error handling prevents full app crashes
- **Environment Validation**: Validates required environment variables at startup

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Supabase (PostgreSQL + Realtime)
- **Styling**: Tailwind CSS 4
- **Validation**: Zod
- **Language**: TypeScript

## Getting Started

### Prerequisites

- Node.js 20+
- Supabase account
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Hermes
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up Supabase Database:
   - Create a new project in [Supabase](https://supabase.com)
   - Go to the SQL Editor
   - Copy and paste the contents of `schema.sql`
   - Run the SQL to create tables, indexes, and enable realtime

4. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```

   Add your Supabase credentials (found in Project Settings > API):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## Database Schema

### meeting_requests
- `id` (uuid, primary key)
- `patient_name` (text)
- `doctor_name` (text)
- `requested_time` (timestamptz)
- `reason_for_visit` (text)
- `status` (enum: pending, approved, rejected, rescheduled, auto_confirmed, needs_callback)
- `confidence_score` (numeric)
- `flag_reason` (text, nullable)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### meeting_actions
- `id` (uuid, primary key)
- `request_id` (uuid, foreign key)
- `patient_name` (text)
- `doctor_name` (text)
- `requested_time` (timestamptz)
- `reason_for_visit` (text)
- `action` (enum: approved, rejected, rescheduled, reassigned, needs_callback)
- `acted_by` (text)
- `new_time` (timestamptz, optional)
- `new_doctor` (text, optional)
- `created_at` (timestamptz)

## Email Intake Integration

### Webhook Endpoint

```
POST /api/intake/email
```

**Payload:**
```json
{
  "from": "patient@example.com",
  "subject": "Appointment Request",
  "body": "Hi, I'm John Doe and I need to see Dr. Smith for a checkup next week."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Appointment request created successfully",
  "appointmentId": "uuid",
  "status": "auto_confirmed",
  "confidence": 0.92
}
```

### Integrating with Email Services

#### SendGrid
1. Go to Settings > Inbound Parse
2. Add your domain and set webhook URL to: `https://your-domain.com/api/intake/email`
3. Configure forwarding in your email settings

#### Mailgun
1. Go to Receiving > Routes
2. Create a new route with expression: `match_recipient("appointments@your-domain.com")`
3. Set action to forward to: `https://your-domain.com/api/intake/email`

#### Postmark
1. Go to Servers > Inbound
2. Add webhook URL: `https://your-domain.com/api/intake/email`
3. Configure forwarding rules

### Future Enhancement: LLM Integration

For production use, integrate with Claude or GPT-4 for better parsing accuracy:

```typescript
import Anthropic from '@anthropic-ai/sdk'

export async function parseEmailWithClaude(emailBody: string) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  })

  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Extract appointment details from this email as JSON...`
    }]
  })

  return JSON.parse(message.content[0].text)
}
```

## Project Structure

```
Hermes/
├── app/
│   ├── actions.ts              # Server actions for appointments
│   ├── layout.tsx              # Root layout with error boundary
│   ├── page.tsx                # Home page
│   ├── queue/                  # Queue management
│   │   ├── page.tsx
│   │   ├── QueueClient.tsx
│   │   └── MeetingActions.tsx
│   ├── audit/                  # Audit log
│   │   ├── page.tsx
│   │   └── AuditClient.tsx
│   ├── intake/                 # Email intake testing
│   │   └── page.tsx
│   └── api/
│       └── intake/email/       # Email webhook endpoint
│           └── route.ts
├── lib/
│   ├── supabase.ts             # Server-side Supabase client
│   ├── supabase-client.ts      # Client-side Supabase client
│   ├── email-parser.ts         # Email parsing logic
│   └── types.ts                # TypeScript types
└── components/
    └── ErrorBoundary.tsx       # Error boundary component
```

## API Reference

### Server Actions

- `simulateAgentRequest()` - Create a random test appointment
- `approveMeeting(requestId)` - Approve an appointment request
- `rejectMeeting(requestId)` - Reject an appointment request
- `rescheduleMeeting(requestId, newTime)` - Reschedule an appointment
- `reassignDoctor(requestId, newDoctor)` - Reassign to a different doctor
- `needsCallbackMeeting(requestId)` - Mark as needing callback

### API Routes

- `GET /api/intake/email` - Endpoint documentation
- `POST /api/intake/email` - Process incoming emails

## Testing the Email Intake

1. Navigate to [http://localhost:3000/intake](http://localhost:3000/intake)
2. Click "Fill Example" to populate a sample email
3. Click "Submit Email" to test the parsing
4. View the created request in the Queue

## Development

### Running Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
npm start
```

### Linting
```bash
npm run lint
```

## Deployment

### Deployment Checklist

Before deploying to production, ensure you have:

- [ ] Set up Supabase project and ran `schema.sql`
- [ ] Configured environment variables in your hosting platform
- [ ] Updated RLS (Row Level Security) policies in Supabase based on your auth requirements
- [ ] Set up email webhook integration (SendGrid, Mailgun, etc.)
- [ ] Tested the email intake endpoint
- [ ] Configured custom domain (if applicable)
- [ ] Set up monitoring and error tracking

### Deploy to Vercel

The easiest way to deploy Hermes is using [Vercel](https://vercel.com):

1. Push your code to GitHub/GitLab/Bitbucket

2. Import your repository in Vercel

3. Configure environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

4. Deploy!

### Deploy to Other Platforms

Hermes can be deployed to any platform that supports Next.js:

- **Netlify**: Use the Next.js build preset
- **Railway**: Connect your repo and add environment variables
- **AWS Amplify**: Use the Next.js SSR hosting
- **Docker**: Create a Dockerfile with Node.js 20+ and run `npm run build && npm start`

### Post-Deployment

1. **Configure Email Webhooks**: Point your email service webhook to `https://your-domain.com/api/intake/email`

2. **Test the Integration**:
   - Send a test email to your intake address
   - Verify it appears in the queue
   - Check realtime updates are working

3. **Security**: Review and update Supabase RLS policies based on your authentication setup

4. **Monitoring**: Set up logging and error tracking (Sentry, LogRocket, etc.)

### Production Considerations

- **Rate Limiting**: Add rate limiting to the email webhook endpoint
- **Email Validation**: Verify sender domains to prevent spam
- **Authentication**: Implement proper user authentication (Supabase Auth, NextAuth.js, etc.)
- **LLM Integration**: Replace mock email parser with real Claude/GPT-4 integration
- **Backup**: Enable Supabase daily backups
- **SSL/TLS**: Ensure HTTPS is enabled (automatic on Vercel)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Acknowledgments

- Built with Next.js and Supabase
- Designed for healthcare appointment management
- AI-powered email parsing capabilities

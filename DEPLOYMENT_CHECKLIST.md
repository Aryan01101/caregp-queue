# Hermes Deployment Checklist

## Pre-Deployment

- [x] All references to old project names removed
- [x] Package files updated with correct project name
- [x] `.env.example` file created
- [x] `.gitignore` configured properly
- [x] SQL schema file created
- [x] README.md finalized with deployment instructions
- [x] Production build tested successfully

## Deployment Steps

### 1. Database Setup
- [ ] Create a Supabase project at https://supabase.com
- [ ] Go to SQL Editor in Supabase dashboard
- [ ] Run the SQL from `schema.sql` to create tables and indexes
- [ ] Verify tables `meeting_requests` and `meeting_actions` are created
- [ ] Confirm Realtime is enabled for both tables

### 2. Environment Variables
- [ ] Copy environment variables from Supabase Project Settings > API
- [ ] Set the following variables in your deployment platform:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

### 3. Deploy Application
Choose your platform:

#### Vercel (Recommended)
- [ ] Push code to GitHub/GitLab/Bitbucket
- [ ] Import repository in Vercel
- [ ] Add environment variables
- [ ] Deploy

#### Other Platforms
- [ ] Configure build command: `npm run build`
- [ ] Configure start command: `npm start`
- [ ] Add environment variables
- [ ] Deploy

### 4. Email Integration
- [ ] Choose email service (SendGrid, Mailgun, Postmark, etc.)
- [ ] Configure webhook to point to: `https://your-domain.com/api/intake/email`
- [ ] Test email intake by sending a test appointment request
- [ ] Verify request appears in queue

### 5. Post-Deployment Testing
- [ ] Visit deployed URL
- [ ] Test "Simulate Patient Request" button
- [ ] Verify requests appear in Queue page
- [ ] Test approving, rejecting, rescheduling requests
- [ ] Check Audit Log page shows all actions
- [ ] Verify realtime updates work (open in two browser tabs)
- [ ] Test email intake endpoint

### 6. Security & Production Hardening
- [ ] Review and update Supabase RLS policies for your auth setup
- [ ] Add rate limiting to email webhook endpoint
- [ ] Implement user authentication (Supabase Auth, NextAuth.js, etc.)
- [ ] Enable Supabase daily backups
- [ ] Set up monitoring/error tracking (Sentry, LogRocket, etc.)
- [ ] Configure custom domain (if applicable)
- [ ] Ensure HTTPS is enabled

### 7. Optional Enhancements
- [ ] Integrate real LLM (Claude/GPT-4) for email parsing
- [ ] Add email validation to prevent spam
- [ ] Set up CI/CD pipeline
- [ ] Add comprehensive test suite
- [ ] Implement proper user roles and permissions

## Deployment Complete!

Once all items are checked, Hermes is ready for production use.

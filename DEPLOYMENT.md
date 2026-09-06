# Hermes v2 Deployment Guide

This document describes how to deploy Hermes v2 to Google Cloud Run.

## Prerequisites

1. **Google Cloud Project**
   - Create a GCP project or use an existing one
   - Enable billing for the project

2. **Required APIs**
   - Cloud Run API
   - Cloud Build API
   - Container Registry API (or Artifact Registry)
   - Secret Manager API

3. **Local Tools**
   - Google Cloud SDK (`gcloud` CLI)
   - Docker (for local testing)

## Setup

### 1. Configure Google Cloud SDK

```bash
# Login to Google Cloud
gcloud auth login

# Set your project ID
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com
```

### 2. Create Secrets in Secret Manager

Store sensitive configuration in GCP Secret Manager:

```bash
# Supabase credentials
echo -n "YOUR_SUPABASE_URL" | gcloud secrets create SUPABASE_URL --data-file=-
echo -n "YOUR_SERVICE_ROLE_KEY" | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=-
echo -n "YOUR_DATABASE_URL" | gcloud secrets create DATABASE_URL --data-file=-

# Anthropic API
echo -n "YOUR_ANTHROPIC_API_KEY" | gcloud secrets create ANTHROPIC_API_KEY --data-file=-

# SendGrid
echo -n "YOUR_SENDGRID_API_KEY" | gcloud secrets create SENDGRID_API_KEY --data-file=-

# Twilio
echo -n "YOUR_TWILIO_ACCOUNT_SID" | gcloud secrets create TWILIO_ACCOUNT_SID --data-file=-
echo -n "YOUR_TWILIO_AUTH_TOKEN" | gcloud secrets create TWILIO_AUTH_TOKEN --data-file=-
```

### 3. Grant Cloud Run Access to Secrets

```bash
# Get the Cloud Run service account
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant secret accessor role
gcloud secrets add-iam-policy-binding SUPABASE_URL \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

# Repeat for all secrets
for SECRET in SUPABASE_SERVICE_ROLE_KEY DATABASE_URL ANTHROPIC_API_KEY SENDGRID_API_KEY TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN
do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor"
done
```

## Deployment Methods

### Method 1: Cloud Build (Recommended)

Deploy using the provided `cloudbuild.yaml`:

```bash
# Submit build from main branch
gcloud builds submit --config cloudbuild.yaml

# Or deploy from a specific branch
git checkout your-branch
gcloud builds submit --config cloudbuild.yaml
```

**Configuration Options**

Edit `cloudbuild.yaml` substitutions to customize:

```yaml
substitutions:
  _REGION: 'us-central1'      # Cloud Run region
  _MEMORY: '512Mi'            # Memory allocation
  _CPU: '1'                   # CPU allocation
  _MIN_INSTANCES: '0'         # Minimum instances (0 = scale to zero)
  _MAX_INSTANCES: '10'        # Maximum instances
  _TIMEOUT: '300s'            # Request timeout
```

### Method 2: Manual Docker Build and Deploy

For local testing or manual deployment:

```bash
# Build Docker image locally
docker build -t gcr.io/YOUR_PROJECT_ID/hermes-v2:latest .

# Test locally
docker run -p 8000:8000 --env-file .env gcr.io/YOUR_PROJECT_ID/hermes-v2:latest

# Push to Container Registry
docker push gcr.io/YOUR_PROJECT_ID/hermes-v2:latest

# Deploy to Cloud Run
gcloud run deploy hermes-v2 \
  --image gcr.io/YOUR_PROJECT_ID/hermes-v2:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300s \
  --set-env-vars ENVIRONMENT=production \
  --update-secrets SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,DATABASE_URL=DATABASE_URL:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,SENDGRID_API_KEY=SENDGRID_API_KEY:latest,TWILIO_ACCOUNT_SID=TWILIO_ACCOUNT_SID:latest,TWILIO_AUTH_TOKEN=TWILIO_AUTH_TOKEN:latest
```

## Post-Deployment

### 1. Verify Deployment

```bash
# Get the service URL
SERVICE_URL=$(gcloud run services describe hermes-v2 --region us-central1 --format="value(status.url)")

# Test health endpoint
curl $SERVICE_URL/health

# Test readiness
curl $SERVICE_URL/health/ready

# Test liveness
curl $SERVICE_URL/health/live
```

### 2. Configure Webhooks

**SendGrid Inbound Parse**
1. Go to SendGrid Dashboard → Settings → Inbound Parse
2. Add hostname and URL: `https://YOUR_SERVICE_URL/webhooks/email`
3. Set destination to your intake email address

**Twilio WhatsApp**
1. Go to Twilio Console → Messaging → WhatsApp senders
2. Configure webhook URL: `https://YOUR_SERVICE_URL/webhooks/whatsapp`
3. Set HTTP method to POST

### 3. Monitor Logs

```bash
# Stream logs
gcloud run services logs tail hermes-v2 --region us-central1

# View logs in Cloud Console
gcloud run services logs read hermes-v2 --region us-central1 --limit 50
```

## Environment-Specific Deployments

### Development

Deploy with different configuration for dev environment:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_MIN_INSTANCES=0,_MAX_INSTANCES=2,_MEMORY=256Mi
```

### Production

Use production-optimized settings:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_MIN_INSTANCES=1,_MAX_INSTANCES=20,_MEMORY=1Gi,_CPU=2
```

## CI/CD Integration

### GitHub Actions

Connect your repository to Cloud Build triggers:

```bash
# Create a trigger for main branch
gcloud builds triggers create github \
  --name=hermes-v2-main \
  --repo-name=YOUR_REPO \
  --repo-owner=YOUR_GITHUB_USERNAME \
  --branch-pattern=^main$ \
  --build-config=cloudbuild.yaml
```

## Troubleshooting

### Common Issues

1. **Container fails to start**
   - Check logs: `gcloud run services logs read hermes-v2`
   - Verify all secrets are accessible
   - Ensure PORT environment variable is not set (defaults to 8000)

2. **Database connection errors**
   - Verify DATABASE_URL secret is correct
   - Check Supabase connection pooling settings
   - Ensure Cloud Run service account has network access

3. **Memory/CPU limits**
   - Monitor resource usage in Cloud Console
   - Adjust `_MEMORY` and `_CPU` in cloudbuild.yaml
   - Consider increasing timeout if needed

### Debug Locally

```bash
# Build and run locally with environment variables
docker build -t hermes-v2-local .
docker run -p 8000:8000 --env-file .env hermes-v2-local

# Access the application
curl http://localhost:8000/health
```

## Cost Optimization

1. **Scale to Zero**: Set `_MIN_INSTANCES=0` for dev environments
2. **Right-size Resources**: Start with minimal memory/CPU and scale up based on usage
3. **Request Timeout**: Set appropriate timeout to avoid long-running requests
4. **Monitoring**: Use Cloud Monitoring to track costs and usage patterns

## Security

1. **Secrets**: Never commit secrets to version control
2. **IAM**: Follow principle of least privilege for service accounts
3. **Network**: Use VPC connectors for private database access if needed
4. **Authentication**: Configure Cloud Run authentication for internal services
5. **CORS**: Update CORS settings in `src/main.py` for production domains

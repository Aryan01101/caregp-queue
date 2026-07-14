'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function IntakePage() {
  const [formData, setFormData] = useState({
    from: '',
    subject: '',
    body: '',
  })
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/intake/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  function fillExample() {
    setFormData({
      from: 'sarah.chen@example.com',
      subject: 'Appointment Request',
      body: `Hi,

My name is Sarah Chen and I would like to schedule an appointment with Dr. Patel for my annual checkup. I'm available next week, preferably on Tuesday or Wednesday afternoon around 2:30 PM.

Thank you,
Sarah Chen
Phone: (555) 123-4567`,
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
          >
            ← Back to Home
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Email Intake Testing
          </h1>
          <p className="text-gray-600 mb-6">
            Test the email intake system by submitting a sample email. The system will parse
            the email content and create an appointment request automatically.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                From (Email Address)
              </label>
              <input
                type="email"
                required
                value={formData.from}
                onChange={(e) => setFormData({ ...formData, from: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="patient@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subject
              </label>
              <input
                type="text"
                required
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Appointment Request"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Body
              </label>
              <textarea
                required
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                rows={10}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                placeholder="Enter the email content here..."
              />
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {loading ? 'Processing...' : 'Submit Email'}
              </button>
              <button
                type="button"
                onClick={fillExample}
                className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
              >
                Fill Example
              </button>
            </div>
          </form>

          {result && (
            <div className={`mt-6 p-4 rounded-lg ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <h3 className={`font-semibold mb-2 ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                {result.success ? 'Success!' : 'Error'}
              </h3>
              <pre className="text-sm overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
              {result.success && (
                <Link
                  href="/queue"
                  className="inline-block mt-4 text-blue-600 hover:text-blue-700 font-medium"
                >
                  View in Queue →
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-blue-900 mb-3">
            Integration Guide
          </h2>
          <p className="text-blue-800 mb-4">
            To integrate with email services, configure webhooks to POST to:
          </p>
          <code className="block bg-white px-4 py-2 rounded border border-blue-200 text-sm font-mono mb-4">
            POST {typeof window !== 'undefined' ? window.location.origin : ''}/api/intake/email
          </code>
          <p className="text-blue-800 text-sm">
            Supported email services: SendGrid, Mailgun, Postmark, AWS SES, or any service
            that can forward emails via webhook.
          </p>
        </div>
      </div>
    </div>
  )
}

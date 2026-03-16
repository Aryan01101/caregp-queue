import { supabase } from '@/lib/supabase'
import { MeetingRequest } from '@/lib/types'
import { SimulateButton } from './SimulateButton'
import { QueueClient } from './QueueClient'
import Link from 'next/link'

export default async function QueuePage() {
  // Fetch pending meeting requests
  const { data: requests, error } = await supabase
    .from('meeting_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching meeting requests:', error)
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Meeting Request Queue
          </h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            Error loading requests. Please try again.
          </div>
        </div>
      </div>
    )
  }

  const pendingRequests = requests as MeetingRequest[]

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Meeting Request Queue
          </h1>
          <div className="flex gap-3">
            <Link
              href="/audit"
              className="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
            >
              View Audit Log
            </Link>
            <SimulateButton />
          </div>
        </div>

        <QueueClient initialRequests={pendingRequests} />
      </div>
    </div>
  )
}

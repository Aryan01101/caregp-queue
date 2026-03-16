import { supabase } from '@/lib/supabase'
import { MeetingAction } from '@/lib/types'
import Link from 'next/link'
import { AuditClient } from './AuditClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AuditPage() {
  // Fetch all meeting actions, sorted by most recent first
  const { data: actions, error } = await supabase
    .from('meeting_actions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching meeting actions:', error)
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Meeting Action Log
          </h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            Error loading audit log. Please try again.
          </div>
        </div>
      </div>
    )
  }

  const meetingActions = actions as MeetingAction[]

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Meeting Action Log</h1>
          <Link
            href="/queue"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Back to Queue
          </Link>
        </div>

        <AuditClient initialActions={meetingActions} />
      </div>
    </div>
  )
}

'use client'

import { MeetingRequest } from '@/lib/types'
import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { MeetingActions } from './MeetingActions'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type QueueClientProps = {
  initialRequests: MeetingRequest[]
}

export function QueueClient({ initialRequests }: QueueClientProps) {
  const [requests, setRequests] = useState<MeetingRequest[]>(initialRequests)

  useEffect(() => {
    // Create client-side Supabase client for Realtime
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Subscribe to changes on meeting_requests table
    const channel = supabase
      .channel('meeting_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'meeting_requests',
        },
        (payload) => {
          console.log('Realtime event:', payload)

          if (payload.eventType === 'INSERT') {
            // New request added
            const newRequest = payload.new as MeetingRequest
            setRequests((current) => [...current, newRequest])
          } else if (payload.eventType === 'UPDATE') {
            // Request updated (e.g., status changed, doctor reassigned)
            const updatedRequest = payload.new as MeetingRequest

            if (updatedRequest.status !== 'pending') {
              // Remove from pending queue if no longer pending
              setRequests((current) =>
                current.filter((req) => req.id !== updatedRequest.id)
              )
            } else {
              // Update in place if still pending (e.g., doctor reassigned)
              setRequests((current) =>
                current.map((req) =>
                  req.id === updatedRequest.id ? updatedRequest : req
                )
              )
            }
          } else if (payload.eventType === 'DELETE') {
            // Request deleted
            const deletedRequest = payload.old as MeetingRequest
            setRequests((current) =>
              current.filter((req) => req.id !== deletedRequest.id)
            )
          }
        }
      )
      .subscribe()

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <>
      {requests.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500 text-lg">
            No pending meeting requests at this time.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Patient Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Doctor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Requested Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {requests.map((request) => (
                <tr key={request.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {request.patient_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {request.doctor_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {new Date(request.requested_time).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {request.reason_for_visit}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <MeetingActions requestId={request.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-sm text-gray-500">
        Total pending requests: {requests.length}
      </div>
    </>
  )
}

'use client'

import { RefillRequest } from '@/lib/types'
import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { ApproveButton } from './ApproveButton'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type QueueClientProps = {
  initialRequests: RefillRequest[]
}

export function QueueClient({ initialRequests }: QueueClientProps) {
  const [requests, setRequests] = useState<RefillRequest[]>(initialRequests)

  useEffect(() => {
    // Create client-side Supabase client for Realtime
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Subscribe to changes on refill_requests table
    const channel = supabase
      .channel('refill_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'refill_requests',
        },
        (payload) => {
          console.log('Realtime event:', payload)

          if (payload.eventType === 'INSERT') {
            // New request added
            const newRequest = payload.new as RefillRequest
            setRequests((current) => [...current, newRequest])
          } else if (payload.eventType === 'UPDATE') {
            // Request updated (e.g., status changed to approved/rejected)
            const updatedRequest = payload.new as RefillRequest

            if (updatedRequest.status !== 'pending') {
              // Remove from pending queue
              setRequests((current) =>
                current.filter((req) => req.id !== updatedRequest.id)
              )
            } else {
              // Update in place
              setRequests((current) =>
                current.map((req) =>
                  req.id === updatedRequest.id ? updatedRequest : req
                )
              )
            }
          } else if (payload.eventType === 'DELETE') {
            // Request deleted
            const deletedRequest = payload.old as RefillRequest
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
            No pending refill requests at this time.
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
                  Medication
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dosage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time Received
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
                    {request.medication}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {request.dosage}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(request.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <ApproveButton requestId={request.id} />
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

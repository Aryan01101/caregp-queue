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
            // Request updated
            const updatedRequest = payload.new as MeetingRequest

            if (updatedRequest.status !== 'pending' && updatedRequest.status !== 'auto_confirmed') {
              // Remove from queue if no longer pending or auto-confirmed
              setRequests((current) =>
                current.filter((req) => req.id !== updatedRequest.id)
              )
            } else {
              // Update in place if still in queue
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

  function getConfidenceBadge(score: number) {
    if (score < 0.70) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-700 border border-red-300">
          {Math.round(score * 100)}% confidence
        </span>
      )
    } else if (score < 0.85) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-700 border border-yellow-300">
          {Math.round(score * 100)}% confidence
        </span>
      )
    } else {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700 border border-green-300">
          {Math.round(score * 100)}% confidence
        </span>
      )
    }
  }

  // Split requests into pending and auto-confirmed
  const pendingRequests = requests.filter(
    (req) => (req.status === 'pending' || req.status === 'needs_callback') && req.confidence_score < 0.85
  )
  const autoConfirmedRequests = requests.filter(
    (req) => req.status === 'auto_confirmed' || req.confidence_score >= 0.85
  )

  return (
    <>
      {/* Pending Requests Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Pending Requests ({pendingRequests.length})
        </h2>
        {pendingRequests.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No pending requests at this time.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${
                  request.status === 'needs_callback' ? 'border-l-4 border-l-blue-400' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {request.patient_name}
                      </h3>
                      {getConfidenceBadge(request.confidence_score)}
                      {request.status === 'needs_callback' && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700 border border-blue-300">
                          📞 Awaiting callback
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Doctor:</span>
                        <span className="ml-2 font-medium text-gray-900">
                          {request.doctor_name}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Time:</span>
                        <span className="ml-2 font-medium text-gray-900">
                          {new Date(request.requested_time).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Reason:</span>
                        <span className="ml-2 font-medium text-gray-900">
                          {request.reason_for_visit}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {request.confidence_score < 0.85 && request.flag_reason && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-yellow-900">Flag:</p>
                        <p className="text-sm text-yellow-800">{request.flag_reason}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <MeetingActions
                    requestId={request.id}
                    patient_name={request.patient_name}
                    doctor_name={request.doctor_name}
                    requested_time={request.requested_time}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-Confirmed Section */}
      {autoConfirmedRequests.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-500 mb-4">
            Auto-Confirmed ({autoConfirmedRequests.length})
          </h2>
          <div className="space-y-3">
            {autoConfirmedRequests.map((request) => (
              <div
                key={request.id}
                className="bg-gray-50 rounded-lg border border-gray-200 p-5 opacity-75"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-medium text-gray-700">
                        {request.patient_name}
                      </h3>
                      {getConfidenceBadge(request.confidence_score)}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                      <div>
                        <span className="text-gray-400">Doctor:</span>
                        <span className="ml-2">{request.doctor_name}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Time:</span>
                        <span className="ml-2">
                          {new Date(request.requested_time).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Reason:</span>
                        <span className="ml-2">{request.reason_for_visit}</span>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      ✓ Confirmed
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 text-sm text-gray-500">
        Total: {requests.length} request(s)
      </div>
    </>
  )
}

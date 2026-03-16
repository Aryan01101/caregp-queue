'use client'

import { MeetingAction } from '@/lib/types'
import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type AuditClientProps = {
  initialActions: MeetingAction[]
}

export function AuditClient({ initialActions }: AuditClientProps) {
  const [actions, setActions] = useState<MeetingAction[]>(initialActions)

  useEffect(() => {
    // Create client-side Supabase client for Realtime
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Subscribe to changes on meeting_actions table
    const actionsChannel = supabase
      .channel('meeting_actions_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // Only listen to new actions
          schema: 'public',
          table: 'meeting_actions',
        },
        (payload) => {
          console.log('Realtime audit event:', payload)

          const newAction = payload.new as MeetingAction
          // Prepend new action to the top (most recent first)
          setActions((current) => [newAction, ...current])
        }
      )
      .subscribe()

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(actionsChannel)
    }
  }, [])

  function getActionBadge(action: MeetingAction['action']) {
    const badges = {
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      rescheduled: 'bg-blue-100 text-blue-800',
      reassigned: 'bg-purple-100 text-purple-800',
      needs_callback: 'bg-blue-100 text-blue-800',
    }

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badges[action]}`}
      >
        {action.charAt(0).toUpperCase() + action.slice(1)}
      </span>
    )
  }

  function getActionDetails(action: MeetingAction) {
    if (action.action === 'rescheduled' && action.new_time) {
      return (
        <span className="text-xs text-gray-600">
          New time:{' '}
          {new Date(action.new_time).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })}
        </span>
      )
    }

    if (action.action === 'reassigned' && action.new_doctor) {
      return (
        <span className="text-xs text-gray-600">
          New doctor: {action.new_doctor}
        </span>
      )
    }

    return <span className="text-xs text-gray-400">—</span>
  }

  return (
    <>
      {actions.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500 text-lg">
            No meeting actions recorded yet.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Request ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Patient
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Doctor
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Requested Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reason
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acted By
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {actions.map((action) => (
                <tr key={action.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                    {action.request_id.slice(0, 8)}...
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {action.patient_name}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                    {action.action === 'reassigned' && action.new_doctor
                      ? action.new_doctor
                      : action.doctor_name}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                    {new Date(action.requested_time).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700 max-w-xs truncate">
                    {action.reason_for_visit}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm">
                    {getActionBadge(action.action)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm">
                    {getActionDetails(action)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                    {action.acted_by}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(action.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-sm text-gray-500">
        Total actions: {actions.length}
      </div>
    </>
  )
}

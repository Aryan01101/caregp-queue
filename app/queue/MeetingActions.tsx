'use client'

import { approveMeeting, rejectMeeting, rescheduleMeeting, reassignDoctor, DOCTORS } from '@/app/actions'
import { useState } from 'react'

type MeetingActionsProps = {
  requestId: string
}

export function MeetingActions({ requestId }: MeetingActionsProps) {
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [isReassigning, setIsReassigning] = useState(false)

  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [showReassignModal, setShowReassignModal] = useState(false)

  const [newTime, setNewTime] = useState('')
  const [newDoctor, setNewDoctor] = useState('')

  const isAnyActionInProgress = isApproving || isRejecting || isRescheduling || isReassigning

  async function handleApprove() {
    if (isAnyActionInProgress) return

    setIsApproving(true)
    try {
      await approveMeeting(requestId)
      console.log('Meeting approved successfully')
    } catch (error) {
      console.error('Failed to approve meeting:', error)
      if (error instanceof Error) {
        alert(error.message)
      } else {
        alert('Failed to approve meeting. It may have already been processed.')
      }
    } finally {
      setIsApproving(false)
    }
  }

  async function handleReject() {
    if (isAnyActionInProgress) return

    setIsRejecting(true)
    try {
      await rejectMeeting(requestId)
      console.log('Meeting rejected successfully')
    } catch (error) {
      console.error('Failed to reject meeting:', error)
      if (error instanceof Error) {
        alert(error.message)
      } else {
        alert('Failed to reject meeting. It may have already been processed.')
      }
    } finally {
      setIsRejecting(false)
    }
  }

  async function handleReschedule() {
    if (isAnyActionInProgress || !newTime) return

    setIsRescheduling(true)
    try {
      await rescheduleMeeting(requestId, new Date(newTime).toISOString())
      console.log('Meeting rescheduled successfully')
      setShowRescheduleModal(false)
      setNewTime('')
    } catch (error) {
      console.error('Failed to reschedule meeting:', error)
      if (error instanceof Error) {
        alert(error.message)
      } else {
        alert('Failed to reschedule meeting. It may have already been processed.')
      }
    } finally {
      setIsRescheduling(false)
    }
  }

  async function handleReassign() {
    if (isAnyActionInProgress || !newDoctor) return

    setIsReassigning(true)
    try {
      await reassignDoctor(requestId, newDoctor)
      console.log('Doctor reassigned successfully')
      setShowReassignModal(false)
      setNewDoctor('')
    } catch (error) {
      console.error('Failed to reassign doctor:', error)
      if (error instanceof Error) {
        alert(error.message)
      } else {
        alert('Failed to reassign doctor. It may have already been processed.')
      }
    } finally {
      setIsReassigning(false)
    }
  }

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleApprove}
          disabled={isAnyActionInProgress}
          className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-colors"
        >
          {isApproving ? 'Approving...' : 'Approve'}
        </button>
        <button
          onClick={handleReject}
          disabled={isAnyActionInProgress}
          className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors"
        >
          {isRejecting ? 'Rejecting...' : 'Reject'}
        </button>
        <button
          onClick={() => setShowRescheduleModal(true)}
          disabled={isAnyActionInProgress}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
        >
          Reschedule
        </button>
        <button
          onClick={() => setShowReassignModal(true)}
          disabled={isAnyActionInProgress}
          className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed transition-colors"
        >
          Reassign
        </button>
      </div>

      {/* Reschedule Modal */}
      {showRescheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Reschedule Meeting</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Date and Time
              </label>
              <input
                type="datetime-local"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowRescheduleModal(false)
                  setNewTime('')
                }}
                disabled={isRescheduling}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReschedule}
                disabled={isRescheduling || !newTime}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
              >
                {isRescheduling ? 'Rescheduling...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Doctor Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Reassign Doctor</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select New Doctor
              </label>
              <select
                value={newDoctor}
                onChange={(e) => setNewDoctor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">-- Select Doctor --</option>
                {DOCTORS.map((doctor) => (
                  <option key={doctor} value={doctor}>
                    {doctor}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowReassignModal(false)
                  setNewDoctor('')
                }}
                disabled={isReassigning}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReassign}
                disabled={isReassigning || !newDoctor}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed transition-colors"
              >
                {isReassigning ? 'Reassigning...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { approveMeeting, needsCallbackMeeting, rescheduleMeeting } from '@/app/actions'

type MeetingActionsProps = {
  requestId: string
  patient_name: string
  doctor_name: string
  requested_time: string
}

export function MeetingActions({ requestId, patient_name, doctor_name, requested_time }: MeetingActionsProps) {
  const [isConfirming, setIsConfirming] = useState(false)
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [newTime, setNewTime] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)

  const isAnyActionInProgress = isConfirming || isRescheduling || isRejecting

  // Handle keyboard events for modal
  useEffect(() => {
    if (!showRescheduleModal) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeModal()
      }
    }

    // Trap focus inside modal
    function handleFocusTrap(e: KeyboardEvent) {
      if (!modalRef.current || e.key !== 'Tab') return

      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0] as HTMLElement
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus()
          e.preventDefault()
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus()
          e.preventDefault()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keydown', handleFocusTrap)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keydown', handleFocusTrap)
    }
  }, [showRescheduleModal])

  function closeModal() {
    setShowRescheduleModal(false)
    setNewTime('')
  }

  async function handleConfirm() {
    setIsConfirming(true)
    try {
      await approveMeeting(requestId)
    } catch (error) {
      if (error instanceof Error) {
        alert(`Failed to confirm: ${error.message}`)
      } else {
        alert('Failed to confirm meeting')
      }
    } finally {
      setIsConfirming(false)
    }
  }

  async function handleReschedule() {
    if (!newTime) return

    setIsRescheduling(true)
    try {
      const result = await rescheduleMeeting(requestId, new Date(newTime).toISOString())
      if (!result?.alreadyProcessed) {
        closeModal()
      }
    } catch (error) {
      if (error instanceof Error) {
        alert(`Failed to reschedule: ${error.message}`)
      } else {
        alert('Failed to reschedule meeting')
      }
    } finally {
      setIsRescheduling(false)
    }
  }

  async function handleCallBack() {
    if (!confirm('Mark this request to call the patient back?')) {
      return
    }

    setIsRejecting(true)
    try {
      await needsCallbackMeeting(requestId)
    } catch (error) {
      if (error instanceof Error) {
        alert(`Failed to mark for callback: ${error.message}`)
      } else {
        alert('Failed to mark for callback')
      }
    } finally {
      setIsRejecting(false)
    }
  }

  return (
    <>
      <div className="flex gap-2" role="group" aria-label="Appointment actions">
        <button
          onClick={handleConfirm}
          disabled={isAnyActionInProgress}
          aria-label={`Confirm appointment for ${patient_name}`}
          className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-colors"
        >
          {isConfirming ? 'Confirming...' : 'Confirm'}
        </button>
        <button
          onClick={() => setShowRescheduleModal(true)}
          disabled={isAnyActionInProgress}
          aria-label={`Reschedule appointment for ${patient_name}`}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
        >
          Reschedule
        </button>
        <button
          onClick={handleCallBack}
          disabled={isAnyActionInProgress}
          aria-label={`Mark ${patient_name} for callback`}
          className="px-3 py-1.5 bg-gray-600 text-white text-sm font-medium rounded hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isRejecting ? 'Marking...' : 'Call Patient Back'}
        </button>
      </div>

      {/* Reschedule Modal */}
      {showRescheduleModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div
            ref={modalRef}
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-title" className="text-xl font-bold text-gray-900 mb-4">
              Reschedule Appointment
            </h2>

            <div className="mb-6">
              <p className="font-bold text-gray-900 mb-1">{patient_name}</p>
              <p className="text-sm text-gray-500">
                Currently: {doctor_name} — {new Date(requested_time).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
              </p>
            </div>

            <div className="mb-4">
              <label htmlFor="new-time-input" className="block text-sm font-medium text-gray-700 mb-2">
                New Date and Time
              </label>
              <input
                id="new-time-input"
                type="datetime-local"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                aria-required="true"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={closeModal}
                disabled={isRescheduling}
                aria-label="Cancel reschedule"
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReschedule}
                disabled={isRescheduling || !newTime}
                aria-label="Confirm reschedule"
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
              >
                {isRescheduling ? 'Rescheduling...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

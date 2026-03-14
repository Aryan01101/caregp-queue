'use client'

import { approveRequest, rejectRequest } from '@/app/actions'
import { useState } from 'react'

type ApproveButtonProps = {
  requestId: string
}

export function ApproveButton({ requestId }: ApproveButtonProps) {
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)

  async function handleApprove() {
    if (isApproving || isRejecting) return

    setIsApproving(true)
    try {
      await approveRequest(requestId)
      console.log('Request approved successfully')
    } catch (error) {
      console.error('Failed to approve request:', error)
      if (error instanceof Error) {
        alert(error.message)
      } else {
        alert('Failed to approve request. It may have already been processed.')
      }
    } finally {
      setIsApproving(false)
    }
  }

  async function handleReject() {
    if (isApproving || isRejecting) return

    setIsRejecting(true)
    try {
      await rejectRequest(requestId)
      console.log('Request rejected successfully')
    } catch (error) {
      console.error('Failed to reject request:', error)
      if (error instanceof Error) {
        alert(error.message)
      } else {
        alert('Failed to reject request. It may have already been processed.')
      }
    } finally {
      setIsRejecting(false)
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={handleApprove}
        disabled={isApproving || isRejecting}
        className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-colors"
      >
        {isApproving ? 'Approving...' : 'Approve'}
      </button>
      <button
        onClick={handleReject}
        disabled={isApproving || isRejecting}
        className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors"
      >
        {isRejecting ? 'Rejecting...' : 'Reject'}
      </button>
    </div>
  )
}

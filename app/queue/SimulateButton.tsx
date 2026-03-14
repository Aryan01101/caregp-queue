'use client'

import { simulateAgentRequest } from '@/app/actions'
import { useState } from 'react'

export function SimulateButton() {
  const [isLoading, setIsLoading] = useState(false)

  async function handleSimulate() {
    setIsLoading(true)
    try {
      const result = await simulateAgentRequest()
      console.log('Simulated request:', result)
    } catch (error) {
      console.error('Failed to simulate request:', error)
      alert('Failed to simulate agent request. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handleSimulate}
      disabled={isLoading}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
    >
      {isLoading ? 'Simulating...' : 'Simulate Agent Request'}
    </button>
  )
}

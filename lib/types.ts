export type MeetingRequest = {
  id: string
  patient_name: string
  doctor_name: string
  requested_time: string
  reason_for_visit: string
  status: 'pending' | 'approved' | 'rejected' | 'rescheduled' | 'auto_confirmed' | 'needs_callback'
  confidence_score: number
  flag_reason: string | null
  created_at: string
  updated_at: string
}

export type MeetingAction = {
  id: string
  request_id: string
  patient_name: string
  doctor_name: string
  requested_time: string
  reason_for_visit: string
  action: 'approved' | 'rejected' | 'rescheduled' | 'reassigned' | 'needs_callback'
  acted_by: string
  new_time?: string
  new_doctor?: string
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      meeting_requests: {
        Row: MeetingRequest
        Insert: Omit<MeetingRequest, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
          confidence_score?: number
          flag_reason?: string | null
        }
        Update: Partial<Omit<MeetingRequest, 'id' | 'created_at' | 'updated_at'>>
      }
      meeting_actions: {
        Row: MeetingAction
        Insert: Omit<MeetingAction, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<MeetingAction, 'id' | 'created_at'>>
      }
    }
  }
}

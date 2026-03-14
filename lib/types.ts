export type RefillRequest = {
  id: string
  patient_name: string
  medication: string
  dosage: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
}

export type ApprovalAction = {
  id: string
  request_id: string
  patient_name: string
  medication: string
  action: 'approved' | 'rejected'
  acted_by: string
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      refill_requests: {
        Row: RefillRequest
        Insert: Omit<RefillRequest, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<RefillRequest, 'id' | 'created_at' | 'updated_at'>>
      }
      approval_actions: {
        Row: ApprovalAction
        Insert: Omit<ApprovalAction, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<ApprovalAction, 'id' | 'created_at'>>
      }
    }
  }
}

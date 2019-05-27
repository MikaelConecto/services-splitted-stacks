interface Address {
  line1?: string
  city?: string
  postal_code?: string
  state?: string
  country?: string
}

interface CustomFields {
  jobType?: string
  jobTypeSpecific?: string
  jobInfo?: string
  preferredContactMethod?: string
  preferredContactTime?: string
  subscribeEmail?: boolean
  cognitoSub?: string
}

interface CRMUpdateData {
  first_name?: string
  last_name?: string
  title?: string
  email?: string
  phone?: string
  address?: Address
  description?: string
  custom_fields?: CustomFields
}

export default CRMUpdateData

export interface TransformedAddress {
  line1: string
  city: string
  postal_code: string
  state: string
  country: string
}

interface TransformedCustomFields {
  RBQ?: string
  NEQ?: string
  cognitoSub?: string
  subscribeEmail?: boolean
  activeForRoofing?: boolean
  latitude?: number
  longitude?: number
  isAdmin?: number
  isActive?: number
  locale?: string
}

interface ContactCreationTransformedRawData {
  is_organization?: boolean
  contact_id?: number
  name?: string
  first_name: string
  last_name: string
  email: string
  phone: string
  address?: TransformedAddress
  custom_fields?: TransformedCustomFields
}

export default ContactCreationTransformedRawData

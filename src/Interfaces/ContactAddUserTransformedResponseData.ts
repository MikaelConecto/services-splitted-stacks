interface ContactCustomFields {
  cognitoSub: string
  subscribeEmail: boolean
  activeForRoofing: boolean
}

interface Contact {
  id: number
  contact_id: number
  first_name: string
  last_name: string
  email: string
  phone: string
  custom_fields: ContactCustomFields
  created_at: string
}

interface ContactCreationTransformedResponseData {
  status: number
  data: Contact
}

export default ContactCreationTransformedResponseData

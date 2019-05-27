interface CompanyCustomFields {
  RBQ?: string
  NEQ?: string
  TVQ?: string
  TPS?: string
  cognitoSub?: string
  subscribeEmail?: boolean
  activeForRoofing?: boolean
  locale?: string
}

interface ContactAddress {
  city: string
  line1: string
  postal_code: string
  state: string
  country: string
}

interface Company {
  id: number
  name: string
  email: string
  phone: string
  address: ContactAddress
  custom_fields: CompanyCustomFields
  customer_status: string
  prospect_status: string
  created_at: string
}

interface Contact {
  id: number
  first_name: string
  last_name: string
  email: string
  phone: string
  custom_fields: CompanyCustomFields
  created_at: string
}

interface ContactData {
  company: Company
  contact: Contact
}

interface ContactCreationTransformedResponseData {
  status: number
  data: ContactData
}

export default ContactCreationTransformedResponseData

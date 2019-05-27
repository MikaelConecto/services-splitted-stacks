interface Address {
  line1: string
  city: string
  postal_code: string
  state: string
  country: string
}

interface StripeContactInfos {
  email: string
  source: string
  address: Address
  name: string
  phone: string
  cognitoSub: string
  zendeskCompanyId: string
  zendeskContactId: string
  preferred_locales: any
}

export default StripeContactInfos

interface ContactCreationRawData {
  companyName: string
  companyNumber: string
  companyAddress: string
  companyCity: string
  companyPostalCode: string
  companyLatitude: number
  companyLongitude: number
  firstname: string
  lastname: string
  tel: string
  email: string
  password: string
  passwordConfirmation: string
  rbq?: string
  neq?: string
  cognitoSub?: string
  subscribeEmail?: boolean
  latitude?: number
  longitude?: number
  locale?: string
  byFastTrack: number
  verified: number
}

export default ContactCreationRawData

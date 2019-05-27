interface MailchimpAddress {
  addr1: string
  city: string
  state: string
  zip: string
  country: string
}

interface MailchimpMergeFields {
  CNAME?: string
  FNAME: string
  LNAME: string
  ADDRESS: MailchimpAddress
  PHONE: string
  JOBTYPE?: string
  JOBTYPESPE?: string
  LOCALE?: string
}

interface MailchimpSubscibeData {
  email_address: string
  status: string
  merge_fields: MailchimpMergeFields
}

export default MailchimpSubscibeData

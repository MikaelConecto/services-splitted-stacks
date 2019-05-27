import Transformer from '../Interfaces/Transformer'
import MailchimpContactSubscibeData from '../Interfaces/MailchimpSubscibeData'

class MailchimpLeadTransformer implements Transformer {
  transform(data: any): MailchimpContactSubscibeData {
    console.log(data.data.address)
    return {
      email_address: data.data.email,
      status: 'subscribed',
      merge_fields: {
        FNAME: data.data.first_name,
        LNAME: data.data.last_name,
        ADDRESS: {
          addr1: data.data.address.streetAddress,
          city: data.data.address.city,
          state: data.data.address.state,
          zip: data.data.address.postal_code,
          country: data.data.address.country,
        },
        PHONE: data.data.phone,
        JOBTYPE: data.data.custom_fields.jobType,
        JOBTYPESPE: data.data.custom_fields.jobTypeSpecific,
      },
    }
  }
}

export default MailchimpLeadTransformer

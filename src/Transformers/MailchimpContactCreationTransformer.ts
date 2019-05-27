import Transformer from '../Interfaces/Transformer'
import MailchimpContactSubscibeData from '../Interfaces/MailchimpSubscibeData'
import ContactCreationTransformedResponseData from '../Interfaces/ContactCreationTransformedResponseData'

class MailchimpContactCreationTransformer implements Transformer {
  transform(
    data: ContactCreationTransformedResponseData
  ): MailchimpContactSubscibeData {
    return {
      email_address: data.data.company.email,
      status: 'subscribed',
      merge_fields: {
        CNAME: data.data.company.name,
        FNAME: data.data.contact.first_name,
        LNAME: data.data.contact.last_name,
        ADDRESS: {
          addr1: data.data.company.address.line1,
          city: data.data.company.address.city,
          state: data.data.company.address.state,
          zip: data.data.company.address.postal_code,
          country: data.data.company.address.country,
        },
        PHONE: data.data.company.phone,
        LOCALE: data.data.company.custom_fields.locale,
      },
    }
  }
}

export default MailchimpContactCreationTransformer

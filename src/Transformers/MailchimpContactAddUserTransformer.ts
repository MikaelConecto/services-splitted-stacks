import Transformer from '../Interfaces/Transformer'

class MailchimpContactAddUserTransformer implements Transformer {
  transform(data: any): any {
    return {
      email_address: data.data.email,
      status: 'subscribed',
      merge_fields: {
        FNAME: data.data.first_name,
        LNAME: data.data.last_name,
        PHONE: data.data.phone,
      },
    }
  }
}

export default MailchimpContactAddUserTransformer

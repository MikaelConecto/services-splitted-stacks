import * as Yup from 'yup'

import ContactCreationRawData from '../Interfaces/ContactCreationRawData'

import regexp from '../Helpers/regexp'

export default Yup.object<ContactCreationRawData>().shape({
  firstName: Yup.string()
    .min(2)
    .max(50)
    .required(),
  lastName: Yup.string()
    .min(2)
    .max(50)
    .required(),
  tel: Yup.string()
    .matches(regexp.phone)
    .required(),
  email: Yup.string()
    .email()
    .required(),
  cognitoSub: Yup.string()
    .min(2)
    .max(50)
    .required(),
})

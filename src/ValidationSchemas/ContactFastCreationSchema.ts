import * as Yup from 'yup'

import ContactCreationRawData from '../Interfaces/ContactCreationRawData'

import regexp from '../Helpers/regexp'

export default Yup.object<ContactCreationRawData>().shape({
  companyName: Yup.string()
    .min(2)
    .max(50)
    .required(),
  companyAddress: Yup.string()
    .min(2)
    .max(50)
    .required(),
  companyCity: Yup.string()
    .min(2)
    .max(50)
    .required(),
  companyPostalCode: Yup.string()
    .matches(regexp.zipcode)
    .required(),
  firstname: Yup.string()
    .min(2)
    .max(50)
    .required(),
  lastname: Yup.string()
    .min(2)
    .max(50)
    .required(),
  tel: Yup.string()
    .matches(regexp.phone)
    .required(),
  email: Yup.string()
    .email()
    .required(),
  rbq: Yup.string(),
  neq: Yup.string(),
  locale: Yup.string(),
})

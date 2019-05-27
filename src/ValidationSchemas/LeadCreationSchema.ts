import * as Yup from 'yup'

import LeadCreationData from '../Interfaces/LeadCreationRawData'

import regexp from '../Helpers/regexp'
import config from '../config'

export default Yup.object<LeadCreationData>().shape({
  firstname: Yup.string()
    .min(2)
    .max(50)
    .required(),
  lastname: Yup.string()
    .min(2)
    .max(50)
    .required(),
  tel: Yup.string()
    .matches(regexp.phone, 'Phone number must be in valid format')
    .required(),
  email: Yup.string()
    .email()
    .required(),
  number: Yup.string()
    .min(2)
    .max(200)
    .required(),
  address: Yup.string()
    .min(2)
    .max(200)
    .required(),
  city: Yup.string()
    .min(2)
    .max(50)
    .required(),
  zipcode: Yup.string()
    .matches(regexp.zipcode, 'Postal code must be valid')
    .required(),
  jobType: Yup.string().required(),
  jobTypeSpecific: Yup.string().required(),
  jobInfo: Yup.string(),
  preferredContactMethod: Yup.string().required(),
  preferredContactTime: Yup.string().required(),
  latitude: Yup.number().required(),
  longitude: Yup.number().required(),
  conditions: Yup.boolean(),
  locale: Yup.mixed()
    .oneOf(config.validation.locale)
    .required(),
})

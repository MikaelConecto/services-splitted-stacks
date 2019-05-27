import { ObjectSchema, ValidateOptions } from 'yup'

interface YupValidator {
  schema: ObjectSchema<any>
  validate: (data: any, options?: ValidateOptions) => Promise<any>
}

export default YupValidator

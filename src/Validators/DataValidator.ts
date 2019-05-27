import { ObjectSchema, ValidateOptions } from 'yup'

import YupValidator from '../Interfaces/YupValidator'

class DataValidator implements YupValidator {
  schema: ObjectSchema<any>

  constructor(schema: ObjectSchema<any>) {
    this.schema = schema
  }

  validate(data: any, options?: ValidateOptions): Promise<any> {
    return this.schema.validate(data, options)
  }
}

export default DataValidator

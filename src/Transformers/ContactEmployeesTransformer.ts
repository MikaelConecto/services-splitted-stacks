import Cryptr from 'cryptr'
import DataTransformer from '../Interfaces/DataTransformer'

const cryptr = new Cryptr(process.env.CRYPTR_SECRET_KEY)

class ContactEmployeesTransformer implements DataTransformer {
  transformResponseData(response: any, options?: any): any {
    const employees = []

    if (response.data.items.length > 0) {
      response.data.items
        .filter(employee => employee.data.custom_fields.isActive === '1')
        .forEach(employee => {
          const employeeToPush = {
            i: employee.data.id,
            id: cryptr.encrypt(employee.data.id),
            isCurrentUser: false,
            name: employee.data.name,
            first_name: employee.data.first_name,
            last_name: employee.data.last_name,
            email: employee.data.email,
            phone: employee.data.phone,
            custom_fields: employee.data.custom_fields,
            customer_status: employee.data.customer_status,
            prospect_status: employee.data.prospect_status,
            created_at: employee.data.created_at,
          }

          if (
            typeof options.currentContactId !== 'undefined' &&
            options.currentContactId === employee.data.id
          ) {
            employeeToPush.isCurrentUser = true
          }
          employees.push(employeeToPush)
        })
    }

    return {
      status: response.status,
      data: employees,
    }
  }
}

export default ContactEmployeesTransformer

import DataTransformer from '../Interfaces/DataTransformer'

class ContactAndOrganizationTransformer implements DataTransformer {
  transformResponseData(response: any): any {
    return {
      status: 200,
      data: {
        organization: {
          id: response.organization.data.id,
          is_organization: response.organization.data.is_organization,
          name: response.organization.data.name,
          phone: response.organization.data.phone,
          email: response.organization.data.email,
          address: response.organization.data.address,
          custom_fields: response.organization.data.custom_fields,
          created_at: response.organization.data.created_at,
          updated_at: response.organization.data.updated_at,
        },
        contact: {
          id: response.contact.data.id,
          is_organization: response.contact.data.is_organization,
          first_name: response.contact.data.first_name,
          last_name: response.contact.data.last_name,
          email: response.contact.data.email,
          phone: response.contact.data.phone,
          created_at: response.contact.data.created_at,
          updated_at: response.contact.data.updated_at,
          custom_fields: {
            conditions: response.contact.data.custom_fields.conditions,
          },
        },
      },
    }
  }
}

export default ContactAndOrganizationTransformer

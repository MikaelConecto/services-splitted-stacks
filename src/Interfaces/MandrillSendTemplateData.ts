interface MandrillSendTemplateContent {
  name: string
  content: string
}

interface MandrillSendTemplateData {
  to: string
  name: string
  subject: string
  templateName: string
  templateContent: MandrillSendTemplateContent[]
  async?: boolean
  sendAt?: string
}

export default MandrillSendTemplateData

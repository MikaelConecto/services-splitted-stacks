function logger(
  title: string,
  permissions: string,
  type: string,
  action?: string,
  info?: string,
  connectedUser?: any
) {
  let log = `${title} - ${permissions}.${type}`

  if (action) {
    log += `.${action}.${info}`
  }

  if (connectedUser) {
    log += ` - ${connectedUser['custom:companyId']}.${
      connectedUser['custom:contactId']
    }.${connectedUser['sub']}}`
  }

  if (action !== 'error') {
    console.log(log)
  } else {
    console.error(log)
  }
}

export default logger

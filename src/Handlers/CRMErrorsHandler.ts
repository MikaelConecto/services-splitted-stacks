class CRMErrorsHandler {
  gerErrorStatusTitle(status) {
    switch (status) {
      case 400:
        return '400 - Bad Request'
      case 401:
        return '401 - Unauthorized'
      case 402:
        return '402 - Payment Required'
      case 403:
        return '403 - Forbidden'
      case 404:
        return '404 - Not Found'
      case 405:
        return '405 - Method Not Allowed'
      case 406:
        return '406 - Not Acceptable'
      case 409:
        return '409 - Conflict'
      case 415:
        return '415 - Unsupported Media Type'
      case 422:
        return '422 - Unprocessable Entity'
      case 429:
        return '429 - Too Many Requests'
      default:
        if (status >= 500) {
          return '500 - CRM problem'
        }
    }
  }

  handle(error: any): any {
    const errorTitle = this.gerErrorStatusTitle(error.response.status)
    const errors = error.response.data.errors
      .map(error => error.error.details)
      .join(', \n')

    return `${errorTitle} | ${errors}`
  }
}

export default CRMErrorsHandler

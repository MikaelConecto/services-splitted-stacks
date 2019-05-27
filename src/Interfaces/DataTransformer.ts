interface DataTransformer {
  transformRawData?: (data: any, option?: any) => any
  transformResponseData?: (response: any, option?: any) => any
}

export default DataTransformer

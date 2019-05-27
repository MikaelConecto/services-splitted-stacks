import MapboxClient from 'mapbox'

import { TransformedAddress as ContactAddressInterface } from '../Interfaces/ContactCreationTransformedRawData'

class GeocoderClient {
  private engine

  constructor() {
    this.engine = new MapboxClient(process.env.MAPBOX_ACCESS_TOKEN)
  }

  async getGeoFromAddress(address: ContactAddressInterface) {
    const formattedAddress = `
      ${address.line1}, 
      ${address.city}, 
      ${address.state}, 
      ${address.postal_code}, 
      ${address.country}
    `
    const geoLocation = await this.engine.geocodeForward(formattedAddress)
    let mostRelevantGeo = null

    geoLocation.entity.features.forEach(feature => {
      if (mostRelevantGeo === null) {
        mostRelevantGeo = feature
      }

      if (feature.relevance > mostRelevantGeo.relevance) {
        mostRelevantGeo = feature
      }
    })

    return {
      latitude: mostRelevantGeo.center[1],
      longitude: mostRelevantGeo.center[0],
    }
  }
}

export default GeocoderClient

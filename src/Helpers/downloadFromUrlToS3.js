import AWS from 'aws-sdk';
import stream from 'stream'
import axios from 'axios';

export default async (url, filename, callback) => {
  console.log('INIT BUCKET', process.env.STATIC_MAPS_BUCKET)
  const s3 = new AWS.S3({ params: { Bucket: process.env.STATIC_MAPS_BUCKET }});
  let contentType = 'application/octet-stream'
  let promise = null

  const uploadStream = () => {
    const pass = new stream.PassThrough();
    promise = s3.upload({
      Key: filename,
      Body: pass,
      ACL: 'public-read',
      ContentType: contentType,
    }).promise();
    return pass;
  }

  const imageRequest = axios({
    method: 'get',
    url: url,
    responseType: 'stream'
  }).then( (response) => {
    console.log('STREAM.then', response)
    if(response.status === 200){
      contentType = response.headers['content-type'];
      response.data.pipe(uploadStream());
    }
  }).catch((error) => {
    console.log('S3 UPLOAD ERROR', error)
  });

  return promise
}
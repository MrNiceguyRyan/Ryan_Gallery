import photo from './photo'
import collection from './collection'

export const schemaTypes = [
  // Collection 必须排在 Photo 前面，因为 Photo 通过 reference 引用了它
  collection,
  photo,
]
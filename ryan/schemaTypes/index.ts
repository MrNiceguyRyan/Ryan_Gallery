import photo from './photo'
import collection from './collection'
import siteSettings from './siteSettings'

export const schemaTypes = [
  // Collection 必须排在 Photo 前面，因为 Photo 通过 reference 引用了它
  collection,
  photo,
  // 全站单例配置（头像、简介、Timeline 等）
  siteSettings,
]
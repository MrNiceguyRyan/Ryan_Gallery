import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'Ryan',

  projectId: 'z610fooo',
  dataset: 'production',

  plugins: [
    structureTool({
      // 默认的文档列表，只是让「笔记 / Notes」按发布日期从新到旧排列，
      // 和网站上的顺序一致。
      structure: (S) =>
        S.list()
          .title('Content')
          .items(
            S.documentTypeListItems().map((item) =>
              item.getId() === 'note'
                ? S.listItem()
                    .id('note')
                    .title('笔记 / Notes')
                    .schemaType('note')
                    .child(
                      S.documentTypeList('note')
                        .title('笔记 / Notes')
                        .defaultOrdering([{field: 'publishedAt', direction: 'desc'}]),
                    )
                : item,
            ),
          ),
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
  },
})

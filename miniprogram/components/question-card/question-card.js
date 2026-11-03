Component({
  options: { addGlobalClass: true },
  properties: {
    item: { type: Object, value: {} },
  },
  data: {
    options: [],
    catName: '',
    catColor: '#86909C',
  },
  observers: {
    item(val) {
      if (!val) return;
      const util = require('../../utils/index.js');
      this.setData({
        options: util.optionMetrics(val.options),
        catName: val.catName || util.categoryMeta(val.cat, require('../../services/api.js').CATEGORIES).name,
        catColor: util.categoryMeta(val.cat, require('../../services/api.js').CATEGORIES).color,
      });
    },
  },
  methods: {
    onTap(e) {
      this.triggerEvent('tap', { id: e.currentTarget.dataset.id });
    },
  },
});

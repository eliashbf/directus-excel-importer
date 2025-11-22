import { defineModule } from '@directus/extensions-sdk';
import ModuleComponent from './module.vue';

export default defineModule({
	id: 'excel-importer',
	name: 'Subir desde Excel',
	icon: 'sheets_rtl',
	routes: [
		{
			path: '',
			component: ModuleComponent,
		},
	],
});

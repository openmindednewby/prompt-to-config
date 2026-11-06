import type { ConfigSchema } from '../../src';

export interface Card {
  shape: string;
  colour: string;
  title: string;
  date: string;
}

export const SCHEMA: ConfigSchema<Card> = {
  choices: { shape: ['circle', 'square'], colour: ['red', 'blue', 'sand'] },
  textKeys: ['title', 'date'],
};

export const BASE: Card = { shape: 'circle', colour: 'sand', title: 'HELLO', date: '' };

export const DATE = /(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day \d{1,2} [A-Z][a-z]+/;

/**
 * As coleções que aparecem na busca.
 *
 * Só entram fontes que liberam CORS — o app é estático e sem backend, então o
 * navegador bloqueia qualquer outra. É o que deixa o IMSLP e o MuseScore.com de
 * fora: incluí-los exigiria um proxy, ou seja, um servidor.
 */

import { StaticIndexSource } from './staticIndexSource';
import { TheSessionSource } from './theSessionSource';
import type { ScoreSource } from './types';

/**
 * Edições acadêmicas em Humdrum kern, com as mãos já em pautas separadas.
 * Ciclos completos: as 32 sonatas de Beethoven, os 370 corais de Bach.
 */
export const humdrumSource = new StaticIndexSource({
  id: 'humdrum',
  label: 'Coleções Humdrum (piano clássico)',
  indexPath: 'catalog/humdrum.json',
  format: 'krn',
});

/**
 * Complementa as coleções acadêmicas com o repertório que as pessoas de fato
 * procuram para aprender: Für Elise, Canon in D, Arabesque, Clair de Lune.
 */
export const museTrainerSource = new StaticIndexSource({
  id: 'musetrainer',
  label: 'MuseTrainer (peças populares)',
  indexPath: 'catalog/musetrainer.json',
  format: 'mxl',
});

export const theSessionSource = new TheSessionSource();

export const SOURCES: ScoreSource[] = [humdrumSource, museTrainerSource, theSessionSource];

import {
  TechnicalVisitDomainError,
} from '../types/technicalVisit';
import type {
  TechnicalVisitFieldAnswer,
  TechnicalVisitFieldAnswerType,
  TechnicalVisitFieldItem,
  TechnicalVisitFieldSection,
} from '../types/technicalVisitFieldForm';

const ANSWER_TYPES: readonly TechnicalVisitFieldAnswerType[] = [
  'short_text',
  'long_text',
  'integer',
  'decimal',
  'boolean',
  'date',
  'time',
  'single_choice',
  'multiple_choice',
];

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function invalid(message: string): never {
  throw new TechnicalVisitDomainError('FIELD_FORM_INVALID', message);
}

function meaningfulAnswer(
  type: TechnicalVisitFieldAnswerType,
  answer: TechnicalVisitFieldAnswer
): boolean {
  if (answer === null) return false;
  if (typeof answer === 'string') return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  if (type === 'boolean') return typeof answer === 'boolean';
  return typeof answer === 'number' && Number.isFinite(answer);
}

function validateAnswer(item: TechnicalVisitFieldItem): void {
  const { type, answer } = item;
  if (answer === null) return;

  switch (type) {
    case 'short_text':
    case 'long_text':
      if (typeof answer !== 'string') invalid('Resposta textual inválida.');
      if (answer.length > (type === 'short_text' ? 500 : 4000)) {
        invalid('A resposta ultrapassa o limite permitido.');
      }
      break;
    case 'integer':
      if (typeof answer !== 'number' || !Number.isInteger(answer)) {
        invalid('Informe um número inteiro válido.');
      }
      break;
    case 'decimal':
      if (typeof answer !== 'number' || !Number.isFinite(answer)) {
        invalid('Informe um número decimal válido.');
      }
      break;
    case 'boolean':
      if (typeof answer !== 'boolean') invalid('Resposta de sim ou não inválida.');
      break;
    case 'date':
      if (typeof answer !== 'string' || !DATE_PATTERN.test(answer)) {
        invalid('Informe uma data válida.');
      }
      break;
    case 'time':
      if (typeof answer !== 'string' || !TIME_PATTERN.test(answer)) {
        invalid('Informe um horário válido.');
      }
      break;
    case 'single_choice':
      if (typeof answer !== 'string' || !item.options.includes(answer)) {
        invalid('Selecione uma opção válida.');
      }
      break;
    case 'multiple_choice':
      if (
        !Array.isArray(answer) ||
        answer.some(
          (value) =>
            typeof value !== 'string' ||
            !item.options.includes(value)
        )
      ) {
        invalid('Selecione apenas opções válidas.');
      }
      break;
  }
}

export function validateTechnicalVisitFieldFormSections(
  sections: readonly TechnicalVisitFieldSection[],
  forSubmission: boolean
): void {
  if (!Array.isArray(sections)) invalid('Estrutura do formulário inválida.');
  if (sections.length > 20) invalid('O formulário excede o limite de seções.');
  if (forSubmission && sections.length === 0) {
    throw new TechnicalVisitDomainError(
      'FIELD_FORM_INCOMPLETE',
      'Adicione ao menos uma seção antes de enviar o formulário.'
    );
  }

  const sectionIds = new Set<string>();
  const itemIds = new Set<string>();
  let totalItems = 0;

  for (const [sectionIndex, section] of sections.entries()) {
    if (!ID_PATTERN.test(section.id)) invalid('Identificador de seção inválido.');
    if (sectionIds.has(section.id)) invalid('Existem seções duplicadas.');
    sectionIds.add(section.id);

    const title = section.title.trim();
    if (title.length > 120) invalid('O título da seção é muito longo.');
    if (forSubmission && title.length === 0) {
      throw new TechnicalVisitDomainError(
        'FIELD_FORM_INCOMPLETE',
        'Informe o título da seção ' + String(sectionIndex + 1) + '.'
      );
    }
    if ((section.description ?? '').length > 600) {
      invalid('A descrição da seção é muito longa.');
    }
    if (!Number.isInteger(section.order) || section.order < 1) {
      invalid('Ordem da seção inválida.');
    }
    if (!Array.isArray(section.items) || section.items.length > 50) {
      invalid('A seção excede o limite de itens.');
    }
    if (forSubmission && section.items.length === 0) {
      throw new TechnicalVisitDomainError(
        'FIELD_FORM_INCOMPLETE',
        'Adicione ao menos um item na seção ' + String(sectionIndex + 1) + '.'
      );
    }

    totalItems += section.items.length;
    if (totalItems > 200) invalid('O formulário excede o limite total de itens.');

    for (const [itemIndex, item] of section.items.entries()) {
      if (!ID_PATTERN.test(item.id)) invalid('Identificador de item inválido.');
      if (itemIds.has(item.id)) invalid('Existem itens duplicados.');
      itemIds.add(item.id);

      if (!ANSWER_TYPES.includes(item.type)) invalid('Tipo de resposta inválido.');
      const label = item.label.trim();
      if (label.length > 180) invalid('O enunciado do item é muito longo.');
      if (forSubmission && label.length === 0) {
        throw new TechnicalVisitDomainError(
          'FIELD_FORM_INCOMPLETE',
          'Informe o enunciado do item ' +
            String(itemIndex + 1) +
            ' da seção ' +
            String(sectionIndex + 1) +
            '.'
        );
      }

      if ((item.observation ?? '').length > 1000) {
        invalid('A observação do item é muito longa.');
      }
      if (!Array.isArray(item.options) || item.options.length > 30) {
        invalid('Quantidade de opções inválida.');
      }

      const normalizedOptions = item.options.map((option) => option.trim());
      if (normalizedOptions.some((option) => option.length > 120)) {
        invalid('Uma opção ultrapassa o limite permitido.');
      }
      if (
        forSubmission &&
        (
          normalizedOptions.some((option) => option.length === 0) ||
          new Set(normalizedOptions).size !== normalizedOptions.length
        )
      ) {
        invalid('As opções precisam ser únicas e preenchidas.');
      }

      if (
        (item.type === 'single_choice' || item.type === 'multiple_choice') &&
        forSubmission &&
        normalizedOptions.length < 2
      ) {
        throw new TechnicalVisitDomainError(
          'FIELD_FORM_INCOMPLETE',
          'Itens de escolha precisam possuir pelo menos duas opções.'
        );
      }

      validateAnswer(item);

      if (forSubmission && item.required && !meaningfulAnswer(item.type, item.answer)) {
        throw new TechnicalVisitDomainError(
          'FIELD_FORM_INCOMPLETE',
          'Responda o item obrigatório "' + label + '".'
        );
      }
    }
  }
}

export function isTechnicalVisitFieldFormComplete(
  sections: readonly TechnicalVisitFieldSection[]
): boolean {
  try {
    validateTechnicalVisitFieldFormSections(sections, true);
    return true;
  } catch {
    return false;
  }
}

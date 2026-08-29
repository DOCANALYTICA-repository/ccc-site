-- Follow-up questions: a question can be shown only after its parent was
-- answered affirmatively. The link is positional within its template/survey.
ALTER TABLE "survey_template_questions" ADD COLUMN "depends_on_position" INTEGER;
ALTER TABLE "event_survey_questions" ADD COLUMN "depends_on_position" INTEGER;

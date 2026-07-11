extends Node
class_name JellyUiEffects

# Godot 4.x helper for the Project Beast-style Q/jelly UI feel.
# Add this node to your scene, then call these methods on Button/Control nodes.

const BUTTON_JELLY_SQUASH := Vector2(1.13, 0.84)
const BUTTON_JELLY_STRETCH := Vector2(0.96, 1.13)

const CARD_WRAP_DISTANCE := 520.0
const CARD_WRAP_ENTRY_OFFSET := 322.0
const CARD_SWIPE_DRAG_MAX_OFFSET := 118.0

var _button_tweens: Dictionary = {}
var _grow_button_tweens: Dictionary = {}
var _card_tween: Tween


func attach_button_jelly(button: Button) -> void:
	if not is_instance_valid(button) or bool(button.get_meta("jelly_enabled", false)):
		return

	button.set_meta("jelly_enabled", true)
	button.set_meta("jelly_base_scale", button.scale)
	button.pivot_offset = button.size * 0.5
	button.focus_mode = Control.FOCUS_NONE
	button.button_down.connect(_play_button_jelly_press.bind(button))
	button.button_up.connect(_play_button_jelly_release.bind(button))


func _play_button_jelly_press(button: Button) -> void:
	if not is_instance_valid(button):
		return
	_tween_button_scale(button, _get_button_base_scale(button) * BUTTON_JELLY_SQUASH, 0.07, Tween.TRANS_QUAD)


func _play_button_jelly_release(button: Button) -> void:
	if not is_instance_valid(button):
		return

	var base_scale := _get_button_base_scale(button)
	_kill_button_tween(button)

	var tween := create_tween()
	_button_tweens[button] = tween
	tween.tween_property(button, "scale", base_scale * BUTTON_JELLY_STRETCH, 0.08).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(button, "scale", base_scale, 0.14).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _tween_button_scale(button: Button, target_scale: Vector2, duration: float, transition: Tween.TransitionType) -> void:
	_kill_button_tween(button)
	var tween := create_tween()
	_button_tweens[button] = tween
	tween.tween_property(button, "scale", target_scale, duration).set_trans(transition).set_ease(Tween.EASE_OUT)


func _kill_button_tween(button: Button) -> void:
	var existing = _button_tweens.get(button)
	if existing is Tween and is_instance_valid(existing):
		(existing as Tween).kill()
	_button_tweens.erase(button)


func _get_button_base_scale(button: Button) -> Vector2:
	var stored = button.get_meta("jelly_base_scale", button.scale)
	if stored is Vector2:
		return stored
	return button.scale


func play_choice_button_pulse(button: Button, confirmed := false) -> void:
	# Use this for Yes/No buttons or any image button that should grow after selection.
	if not is_instance_valid(button):
		return

	_kill_button_tween(button)
	var tween := create_tween()
	_button_tweens[button] = tween

	var final_scale := Vector2(1.18, 1.18) if confirmed else Vector2(1.12, 1.12)
	tween.tween_property(button, "scale", Vector2(1.26, 0.82), 0.08).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(button, "scale", Vector2(0.96, 1.18), 0.08).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(button, "scale", final_scale, 0.12).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func play_grow_button_pulse(
	button: Button,
	target_size: Vector2,
	target_position: Vector2,
	confirmed := false
) -> void:
	# Use this for a Start Game style button:
	# first click grows/selects, second click confirms with a stronger pulse.
	if not is_instance_valid(button):
		return

	_kill_grow_button_tween(button)
	button.pivot_offset = button.size * 0.5

	var tween := create_tween()
	_grow_button_tweens[button] = tween

	var final_scale := Vector2(1.18, 1.18) if confirmed else Vector2(1.12, 1.12)
	tween.tween_property(button, "size", target_size, 0.10).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(button, "position", target_position, 0.10).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(button, "pivot_offset", target_size * 0.5, 0.10).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(button, "scale", Vector2(1.28, 0.84), 0.08).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(button, "scale", Vector2(1.03, 1.24), 0.08).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(button, "scale", final_scale, 0.15).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func reset_grow_button(
	button: Button,
	base_size: Vector2,
	base_position: Vector2,
	animated := true
) -> void:
	if not is_instance_valid(button):
		return

	_kill_grow_button_tween(button)
	if animated:
		var tween := create_tween()
		_grow_button_tweens[button] = tween
		tween.tween_property(button, "size", base_size, 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tween.parallel().tween_property(button, "position", base_position, 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tween.parallel().tween_property(button, "pivot_offset", base_size * 0.5, 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tween.parallel().tween_property(button, "scale", Vector2.ONE, 0.12).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	else:
		button.size = base_size
		button.position = base_position
		button.pivot_offset = base_size * 0.5
		button.scale = Vector2.ONE


func _kill_grow_button_tween(button: Button) -> void:
	var existing = _grow_button_tweens.get(button)
	if existing is Tween and is_instance_valid(existing):
		(existing as Tween).kill()
	_grow_button_tweens.erase(button)


func layout_jelly_cards(
	cards: Array,
	selected_index: int,
	animated := true,
	direction := 1,
	center := Vector2(40.0, 72.0),
	spacing := 322.0
) -> void:
	# cards: Array[Control]. Keeps the selected card centered and side cards partially visible.
	if _card_tween and is_instance_valid(_card_tween):
		_card_tween.kill()
	if animated:
		_card_tween = create_tween()
		_card_tween.set_parallel(true)

	var count := cards.size()
	if count <= 0:
		return

	var half_count := int(count / 2.0)
	for index in count:
		var card := cards[index] as Control
		if not is_instance_valid(card):
			continue

		var offset := index - selected_index
		if offset > half_count:
			offset -= count
		elif offset < -half_count:
			offset += count

		var distance := absi(offset)
		var target_position := center + Vector2(float(offset) * spacing, float(distance) * 12.0)
		var target_scale := Vector2.ONE * (1.0 if distance == 0 else 0.86 if distance == 1 else 0.72)
		var target_alpha := 1.0 if distance <= 1 else 0.0

		if distance > 1:
			card.z_index = 0
		elif offset < 0:
			card.z_index = 10
		elif offset > 0:
			card.z_index = 30
		else:
			card.z_index = 20

		if animated:
			_animate_card_to(card, target_position, target_scale, target_alpha, offset, distance, direction)
		else:
			card.position = target_position
			card.scale = target_scale
			card.rotation = 0.0
			card.modulate.a = target_alpha


func _animate_card_to(
	card: Control,
	target_position: Vector2,
	target_scale: Vector2,
	target_alpha: float,
	offset: int,
	distance: int,
	direction: int
) -> void:
	var wraps_around := absf(card.position.x - target_position.x) > CARD_WRAP_DISTANCE
	var enters_from_hidden := card.modulate.a <= 0.01 and target_alpha > 0.0
	var jelly_amount := maxf(0.04, 0.12 - float(distance) * 0.025)
	var squash_scale := Vector2(target_scale.x * (1.0 + jelly_amount), target_scale.y * (1.0 - jelly_amount * 0.70))
	var stretch_scale := Vector2(target_scale.x * (1.0 - jelly_amount * 0.35), target_scale.y * (1.0 + jelly_amount * 0.55))
	var sway := float(direction) * (0.038 + jelly_amount * 0.05)

	if wraps_around or enters_from_hidden:
		if target_alpha > 0.0:
			var entry_direction := 1.0 if offset >= 0 else -1.0
			card.modulate.a = 0.0
			card.position = target_position + Vector2(entry_direction * CARD_WRAP_ENTRY_OFFSET, 0.0)
			card.scale = stretch_scale
			card.rotation = -sway * 0.6
			_card_tween.tween_property(card, "position", target_position, 0.26).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
			_card_tween.tween_property(card, "modulate:a", target_alpha, 0.10).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
			_card_tween.tween_property(card, "scale", squash_scale, 0.08).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
			_card_tween.tween_property(card, "scale", stretch_scale, 0.09).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT).set_delay(0.08)
			_card_tween.tween_property(card, "scale", target_scale, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT).set_delay(0.17)
			_card_tween.tween_property(card, "rotation", sway * 0.40, 0.10).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
			_card_tween.tween_property(card, "rotation", 0.0, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT).set_delay(0.10)
		else:
			card.modulate.a = 0.0
			card.position = target_position
			card.scale = target_scale
			card.rotation = 0.0
	else:
		_card_tween.tween_property(card, "position", target_position, 0.34).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		_card_tween.tween_property(card, "scale", squash_scale, 0.08).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		_card_tween.tween_property(card, "scale", stretch_scale, 0.10).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT).set_delay(0.08)
		_card_tween.tween_property(card, "scale", target_scale, 0.20).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT).set_delay(0.18)
		_card_tween.tween_property(card, "rotation", -sway, 0.08).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		_card_tween.tween_property(card, "rotation", sway * 0.46, 0.11).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT).set_delay(0.08)
		_card_tween.tween_property(card, "rotation", 0.0, 0.20).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT).set_delay(0.19)
		_card_tween.tween_property(card, "modulate:a", target_alpha, 0.24)


func update_jelly_card_drag(
	cards: Array,
	selected_index: int,
	drag_pixels: float,
	center := Vector2(40.0, 72.0),
	spacing := 322.0
) -> void:
	# Call while dragging/swiping. On release, update selected_index and call layout_jelly_cards().
	var count := cards.size()
	if count <= 0:
		return

	var drag_offset := clampf(drag_pixels, -CARD_SWIPE_DRAG_MAX_OFFSET, CARD_SWIPE_DRAG_MAX_OFFSET)
	var drag_strength := absf(drag_offset) / CARD_SWIPE_DRAG_MAX_OFFSET
	var drag_direction := 0.0
	if absf(drag_offset) > 0.001:
		drag_direction = 1.0 if drag_offset > 0.0 else -1.0

	var half_count := int(count / 2.0)
	for index in count:
		var card := cards[index] as Control
		if not is_instance_valid(card):
			continue

		var offset := index - selected_index
		if offset > half_count:
			offset -= count
		elif offset < -half_count:
			offset += count

		var distance := absi(offset)
		var target_position := center + Vector2(float(offset) * spacing, float(distance) * 12.0)
		var target_scale := Vector2.ONE * (1.0 if distance == 0 else 0.86 if distance == 1 else 0.72)
		var target_alpha := 1.0 if distance <= 1 else 0.0
		var distance_drag_scale := maxf(0.56, 1.0 - float(distance) * 0.18)
		var squash := 0.06 * drag_strength * distance_drag_scale

		if distance > 1:
			card.z_index = 0
		elif offset < 0:
			card.z_index = 10
		elif offset > 0:
			card.z_index = 30
		else:
			card.z_index = 20

		card.position = target_position + Vector2(drag_offset * distance_drag_scale, 0.0)
		card.scale = Vector2(target_scale.x * (1.0 + squash), target_scale.y * (1.0 - squash * 0.72))
		card.rotation = -drag_direction * (0.014 + 0.036 * drag_strength) * distance_drag_scale
		card.modulate.a = target_alpha


func make_button_style(
	color: Color,
	corner_radius: float,
	border_color := Color(1.0, 1.0, 1.0, 0.42),
	border_width := 2
) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.corner_radius_top_left = int(corner_radius)
	style.corner_radius_top_right = int(corner_radius)
	style.corner_radius_bottom_left = int(corner_radius)
	style.corner_radius_bottom_right = int(corner_radius)
	style.border_width_left = border_width
	style.border_width_top = border_width
	style.border_width_right = border_width
	style.border_width_bottom = border_width
	style.border_color = border_color
	return style
